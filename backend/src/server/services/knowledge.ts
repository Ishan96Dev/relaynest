import "server-only";
import type { z } from "zod";
import { milvusConfig } from "@backend/lib/env/vector";
import { ApiError, Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import type { collectionInput, updateCollectionInput } from "@backend/lib/validation/schemas";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { deleteVectors, ensureCollection, pingMilvus, upsertVectors } from "@backend/server/ai/milvus";
import { embedMany, rateLimit } from "@backend/server/ai/provider";
import { withUsageScope } from "@backend/server/ai/usage";
import { chunkText } from "@backend/server/knowledge/chunk";
import {
  extractFileText,
  KnowledgeError,
  kindFromFilename,
  MAX_FILE_BYTES,
  type DocKind,
  type FileDocKind,
} from "@backend/server/knowledge/extract";
import {
  normalizePublicUrl,
  scrapeWebsite,
  type ScrapeConfig,
  type ScrapeLogLevel,
  type ScrapeMode,
} from "@backend/server/knowledge/scrape";
import { logEvent } from "@backend/server/logger";
import { getProviderConfig } from "@backend/server/services/ai-models";
import { notify, notifyOwners } from "@backend/server/notifications";
import { kbEmbedModel, retrieve, type RetrievalResult } from "@backend/server/services/knowledge-retrieval";

const BUCKET = "knowledge";
const MAX_DOCS_PER_COLLECTION = 200;
const EMBED_BATCH = 16;
const MAX_CHUNKS_PER_DOC = 500;

export interface CollectionDto {
  id: string; name: string; description: string; tone: "primary" | "info" | "success" | "amber";
  documents: number; sizeBytes: number; botIds: string[]; createdAt: string; updatedAt: string;
}
export interface DocumentDto {
  id: string; collectionId: string; collectionName: string; kind: DocKind; name: string; sourceUrl: string | null; sizeBytes: number;
  status: "uploaded" | "processing" | "indexed" | "failed"; error: string | null; chunkCount: number; vectorIndexed: boolean;
  scrapeMode: ScrapeMode; scrapeConfig: ScrapeConfig; progressStage: string | null;
  pagesTotal: number; pagesScraped: number; pagesFailed: number;
  createdAt: string; indexedAt: string | null;
}
export interface IngestionLogDto {
  id: string;
  documentId: string;
  documentName?: string;
  level: ScrapeLogLevel;
  stage: string;
  message: string;
  url: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}
export interface DocumentPreviewChunk {
  position: number;
  content: string;
  sourceUrl: string | null;
  pageTitle: string | null;
}
export interface LinkableBotDto { id: string; name: string; username: string | null; status: string; kind: "agent" | "bot" }
export interface KnowledgeStatusDto { vector: { configured: boolean; reachable: boolean | null; collection: string | null; message: string | null }; embedModel: string; embeddingsReady: boolean }

type Row = Record<string, unknown>;
const DOC_COLUMNS =
  "id, collection_id, kind, name, source_url, size_bytes, status, error, chunk_count, vector_indexed, scrape_mode, scrape_config, progress_stage, pages_total, pages_scraped, pages_failed, created_at, indexed_at";

function toDoc(r: Row, names: Map<string, string>): DocumentDto {
  const rawMode = r.scrape_mode as string | undefined;
  const scrapeMode: ScrapeMode = rawMode === "sitemap" || rawMode === "subpages" ? rawMode : "single";
  const rawCfg = r.scrape_config && typeof r.scrape_config === "object" ? (r.scrape_config as ScrapeConfig) : {};
  return {
    id: r.id as string,
    collectionId: r.collection_id as string,
    collectionName: names.get(r.collection_id as string) ?? "",
    kind: r.kind as DocKind,
    name: r.name as string,
    sourceUrl: (r.source_url as string | null) ?? null,
    sizeBytes: Number(r.size_bytes ?? 0),
    status: r.status as DocumentDto["status"],
    error: (r.error as string | null) ?? null,
    chunkCount: Number(r.chunk_count ?? 0),
    vectorIndexed: Boolean(r.vector_indexed),
    scrapeMode,
    scrapeConfig: rawCfg,
    progressStage: (r.progress_stage as string | null) ?? null,
    pagesTotal: Number(r.pages_total ?? 0),
    pagesScraped: Number(r.pages_scraped ?? 0),
    pagesFailed: Number(r.pages_failed ?? 0),
    createdAt: r.created_at as string,
    indexedAt: (r.indexed_at as string | null) ?? null,
  };
}

function toLogDto(r: Row, docNames?: Map<string, string>): IngestionLogDto {
  return {
    id: r.id as string,
    documentId: r.document_id as string,
    ...(docNames ? { documentName: docNames.get(r.document_id as string) ?? undefined } : {}),
    level: (r.level as ScrapeLogLevel) ?? "info",
    stage: String(r.stage ?? "info"),
    message: String(r.message ?? ""),
    url: (r.url as string | null) ?? null,
    meta: r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {},
    createdAt: r.created_at as string,
  };
}

async function writeIngestionLog(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  documentId: string,
  level: ScrapeLogLevel,
  stage: string,
  message: string,
  url?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("kb_ingestion_logs").insert({
      workspace_id: workspaceId,
      document_id: documentId,
      level,
      stage: stage.slice(0, 40),
      message: message.slice(0, 1000),
      url: url ? url.slice(0, 2000) : null,
      meta: meta ?? {},
    });
  } catch {
    // Logging must never abort ingestion.
  }
}

// ---------- collections ----------
export async function listCollections(ctx: AuthContext): Promise<CollectionDto[]> {
  const [cols, docs, links] = await Promise.all([
    ctx.supabase.from("kb_collections").select("id, name, description, tone, created_at, updated_at").eq("workspace_id", ctx.workspaceId).order("updated_at", { ascending: false }),
    ctx.supabase.from("kb_documents").select("collection_id, size_bytes").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_bot_links").select("collection_id, bot_id").eq("workspace_id", ctx.workspaceId),
  ]);
  if (cols.error || docs.error || links.error) throw new Error("Failed to load collections");
  return (cols.data ?? []).map((c) => {
    const mine = (docs.data ?? []).filter((d) => d.collection_id === c.id);
    return {
      id: c.id as string, name: c.name as string, description: c.description as string, tone: c.tone as CollectionDto["tone"],
      documents: mine.length, sizeBytes: mine.reduce((s, d) => s + Number(d.size_bytes ?? 0), 0),
      botIds: (links.data ?? []).filter((l) => l.collection_id === c.id).map((l) => l.bot_id as string),
      createdAt: c.created_at as string, updatedAt: c.updated_at as string,
    };
  });
}

async function ownCollection(ctx: AuthContext, id: string): Promise<{ id: string; name: string }> {
  const { data } = await ctx.supabase.from("kb_collections").select("id, name").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!data) throw Errors.notFound("Collection");
  return data as { id: string; name: string };
}

export async function createCollection(ctx: AuthContext, input: z.infer<typeof collectionInput>): Promise<CollectionDto> {
  requireWrite(ctx);
  const { data, error } = await ctx.supabase.from("kb_collections")
    .insert({ workspace_id: ctx.workspaceId, name: input.name, description: input.description, tone: input.tone, created_by: ctx.userId })
    .select("id, name, description, tone, created_at, updated_at").single();
  if (error) {
    if (error.code === "23505") throw Errors.conflict("A collection with this name already exists.");
    throw new Error("Failed to create the collection");
  }
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "kb_collection_created",
    title: `Knowledge collection created: ${data.name as string}`,
    body: "Upload PDF, Word, Excel, CSV, PowerPoint, Markdown, TXT, JSON, HTML files or crawl websites & sitemaps.",
  });
  return { id: data.id, name: data.name, description: data.description, tone: data.tone, documents: 0, sizeBytes: 0, botIds: [], createdAt: data.created_at, updatedAt: data.updated_at };
}

export async function updateCollection(ctx: AuthContext, id: string, input: z.infer<typeof updateCollectionInput>): Promise<void> {
  requireWrite(ctx);
  await ownCollection(ctx, id);
  const { error } = await ctx.supabase.from("kb_collections").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) {
    if (error.code === "23505") throw Errors.conflict("A collection with this name already exists.");
    throw new Error("Failed to update the collection");
  }
}

export async function deleteCollection(ctx: AuthContext, id: string): Promise<void> {
  requireWrite(ctx);
  const col = await ownCollection(ctx, id);
  const admin = createAdminClient();
  const { data: docs } = await admin.from("kb_documents").select("storage_path").eq("collection_id", id).eq("workspace_id", ctx.workspaceId);
  await deleteVectors("collection_id", id).catch((e) => console.error("[knowledge] vector cleanup failed:", e instanceof Error ? e.message : "unknown"));
  const { error } = await ctx.supabase.from("kb_collections").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the collection");
  const paths = (docs ?? []).map((d) => d.storage_path as string | null).filter((p): p is string => Boolean(p));
  if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => undefined);
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "kb_collection_deleted",
    title: `Knowledge collection deleted: ${col.name}`,
    body: "The collection, its indexed chunks, and stored files were removed.",
  });
}

/** Replaces the set of bots that can use a collection. */
export async function setCollectionBots(ctx: AuthContext, id: string, botIds: string[]): Promise<string[]> {
  requireWrite(ctx);
  await ownCollection(ctx, id);
  const unique = [...new Set(botIds)];
  if (unique.length) {
    const { data } = await ctx.supabase.from("bots").select("id").eq("workspace_id", ctx.workspaceId).in("id", unique);
    if ((data ?? []).length !== unique.length) throw Errors.invalid("One of the selected bots was not found.");
  }
  const { data: current } = await ctx.supabase.from("kb_bot_links").select("bot_id").eq("collection_id", id);
  const have = new Set((current ?? []).map((r) => r.bot_id as string));
  const add = unique.filter((b) => !have.has(b));
  const drop = [...have].filter((b) => !unique.includes(b));
  if (drop.length) {
    const { error } = await ctx.supabase.from("kb_bot_links").delete().eq("collection_id", id).in("bot_id", drop);
    if (error) throw new Error("Failed to update linked bots");
  }
  if (add.length) {
    const { error } = await ctx.supabase.from("kb_bot_links").insert(add.map((bot_id) => ({ collection_id: id, bot_id, workspace_id: ctx.workspaceId })));
    if (error) throw new Error("Failed to update linked bots");
  }
  return unique;
}

/** Bots a collection can be shared with. Bots that belong to an AI agent are labelled so the picker can group them. */
export async function listLinkableBots(ctx: AuthContext): Promise<LinkableBotDto[]> {
  const [bots, agents] = await Promise.all([
    ctx.supabase.from("bots").select("id, name, telegram_username, status").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("ai_agents").select("bot_id").eq("workspace_id", ctx.workspaceId).not("bot_id", "is", null),
  ]);
  const agentBots = new Set((agents.data ?? []).map((a) => a.bot_id as string));
  return (bots.data ?? []).map((b) => ({ id: b.id as string, name: b.name as string, username: (b.telegram_username as string | null) ?? null, status: b.status as string, kind: agentBots.has(b.id as string) ? "agent" : "bot" }));
}

// ---------- documents ----------
export async function listDocuments(ctx: AuthContext, collectionId?: string): Promise<DocumentDto[]> {
  let q = ctx.supabase.from("kb_documents").select(DOC_COLUMNS).eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(500);
  if (collectionId) q = q.eq("collection_id", collectionId);
  const [docs, cols] = await Promise.all([q, ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId)]);
  if (docs.error) throw new Error("Failed to load documents");
  const names = new Map((cols.data ?? []).map((c) => [c.id as string, c.name as string]));
  return (docs.data ?? []).map((d) => toDoc(d as unknown as Row, names));
}

async function assertRoom(ctx: AuthContext, collectionId: string) {
  const { count } = await ctx.supabase.from("kb_documents").select("id", { count: "exact", head: true }).eq("collection_id", collectionId);
  if ((count ?? 0) >= MAX_DOCS_PER_COLLECTION) throw Errors.invalid(`A collection holds up to ${MAX_DOCS_PER_COLLECTION} documents.`);
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";

/** Stores an uploaded file and creates its document row. Call processDocument afterwards (it can run after the response). */
export async function createFileDocument(ctx: AuthContext, collectionId: string, file: File): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-upload:${ctx.userId}`, 30, 60_000);
  const col = await ownCollection(ctx, collectionId);
  const kind = kindFromFilename(file.name);
  if (!kind || kind === "url") {
    throw Errors.invalid("Unsupported file type. Upload PDF, Word (.docx/.doc/.odt/.rtf), Excel (.xlsx/.xls/.ods), CSV/TSV, PowerPoint (.pptx/.odp), TXT, Markdown, JSON/YAML/XML, or HTML.");
  }
  if (file.size === 0) throw Errors.invalid("This file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Files can be up to 10 MB.");
  await assertRoom(ctx, collectionId);
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const path = `${ctx.workspaceId}/${id}/${safeName(file.name)}`;
  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw new Error("Failed to store the file");
  const { data, error } = await admin.from("kb_documents")
    .insert({
      id,
      workspace_id: ctx.workspaceId,
      collection_id: collectionId,
      kind,
      name: file.name.slice(0, 300),
      storage_path: path,
      size_bytes: file.size,
      status: "processing",
      progress_stage: "queued",
      scrape_mode: "single",
      scrape_config: {},
      created_by: ctx.userId,
    })
    .select(DOC_COLUMNS).single();
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new Error("Failed to save the document");
  }
  await writeIngestionLog(admin, ctx.workspaceId, id, "info", "queued", `Uploaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${kind.toUpperCase()}). Queued for text extraction.`);
  return toDoc(data as unknown as Row, new Map([[collectionId, col.name]]));
}

export async function createUrlDocument(
  ctx: AuthContext,
  collectionId: string,
  rawUrl: string,
  options: { mode?: ScrapeMode; config?: ScrapeConfig } = {},
): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-upload:${ctx.userId}`, 30, 60_000);
  const col = await ownCollection(ctx, collectionId);
  let parsed: URL;
  try {
    parsed = normalizePublicUrl(rawUrl);
  } catch (e) {
    throw Errors.invalid(e instanceof Error ? e.message : "Enter a valid public HTTPS URL.");
  }
  await assertRoom(ctx, collectionId);
  const mode: ScrapeMode = options.mode ?? "single";
  const cfg: ScrapeConfig = {
    ...(options.config?.maxPages ? { maxPages: Math.min(50, Math.max(1, options.config.maxPages)) } : {}),
    ...(options.config?.maxDepth ? { maxDepth: Math.min(3, Math.max(1, options.config.maxDepth)) } : {}),
    ...(options.config?.samePathPrefix !== undefined ? { samePathPrefix: options.config.samePathPrefix } : {}),
    ...(options.config?.pathPrefix?.trim() ? { pathPrefix: options.config.pathPrefix.trim() } : {}),
    ...(options.config?.excludePatterns?.length ? { excludePatterns: options.config.excludePatterns } : {}),
  };
  const labelSuffix = mode === "sitemap" ? " (Sitemap)" : mode === "subpages" ? " (Subpages)" : "";
  const initialName = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`.slice(0, 260) + labelSuffix;
  const admin = createAdminClient();
  const { data, error } = await admin.from("kb_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      collection_id: collectionId,
      kind: "url",
      name: initialName.slice(0, 300),
      source_url: parsed.toString(),
      status: "processing",
      progress_stage: "queued",
      scrape_mode: mode,
      scrape_config: cfg,
      pages_total: mode === "single" ? 1 : 0,
      pages_scraped: 0,
      pages_failed: 0,
      created_by: ctx.userId,
    })
    .select(DOC_COLUMNS).single();
  if (error) throw new Error("Failed to save the document");
  const modeDesc =
    mode === "sitemap"
      ? `sitemap scrape (up to ${cfg.maxPages ?? 15} pages)`
      : mode === "subpages"
        ? `subpages crawl (up to ${cfg.maxPages ?? 15} pages, depth ${cfg.maxDepth ?? 2})`
        : "single page scrape";
  await writeIngestionLog(admin, ctx.workspaceId, data.id as string, "info", "queued", `Queued ${modeDesc} for ${parsed.toString()}.`, parsed.toString());
  return toDoc(data as unknown as Row, new Map([[collectionId, col.name]]));
}

async function loadDoc(ctx: AuthContext, id: string) {
  const { data } = await ctx.supabase.from("kb_documents").select(`${DOC_COLUMNS}, storage_path`).eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!data) throw Errors.notFound("Document");
  return data as unknown as Row;
}

export async function deleteDocument(ctx: AuthContext, id: string): Promise<void> {
  requireWrite(ctx);
  const doc = await loadDoc(ctx, id);
  const admin = createAdminClient();
  await deleteVectors("document_id", id).catch((e) => console.error("[knowledge] vector cleanup failed:", e instanceof Error ? e.message : "unknown"));
  const { error } = await admin.from("kb_documents").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the document");
  if (doc.storage_path) await admin.storage.from(BUCKET).remove([doc.storage_path as string]).catch(() => undefined);
  await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).eq("id", doc.collection_id as string);
}

/** Marks a document as processing again so the caller can schedule processDocument. */
export async function prepareReindex(ctx: AuthContext, id: string): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-reindex:${ctx.userId}`, 20, 60_000);
  const existing = await loadDoc(ctx, id);
  const admin = createAdminClient();
  await admin.from("kb_ingestion_logs").delete().eq("document_id", id).eq("workspace_id", ctx.workspaceId);
  const { data, error } = await admin
    .from("kb_documents")
    .update({
      status: "processing",
      error: null,
      progress_stage: "queued",
      pages_scraped: 0,
      pages_failed: 0,
      pages_total: existing.kind === "url" && existing.scrape_mode === "single" ? 1 : 0,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select(DOC_COLUMNS)
    .single();
  if (error) throw new Error("Failed to restart indexing");
  await writeIngestionLog(admin, ctx.workspaceId, id, "info", "queued", `Restarting processing for "${existing.name as string}"...`, (existing.source_url as string | null) ?? null);
  const { data: col } = await ctx.supabase.from("kb_collections").select("id, name").eq("id", data.collection_id).maybeSingle();
  return toDoc(data as unknown as Row, new Map(col ? [[col.id as string, col.name as string]] : []));
}

export async function previewDocument(
  ctx: AuthContext,
  id: string,
): Promise<{
  document: DocumentDto;
  chunks: DocumentPreviewChunk[];
  logs: IngestionLogDto[];
  pages: Array<{ url: string; title: string; chunks: number }>;
}> {
  const doc = await loadDoc(ctx, id);
  const [{ data: chunks }, { data: allPageRows }, { data: logs }, { data: col }] = await Promise.all([
    ctx.supabase.from("kb_chunks").select("position, content, source_url, page_title").eq("document_id", id).order("position").limit(20),
    ctx.supabase.from("kb_chunks").select("source_url, page_title").eq("document_id", id).not("source_url", "is", null).limit(500),
    ctx.supabase.from("kb_ingestion_logs").select("id, document_id, level, stage, message, url, meta, created_at").eq("document_id", id).order("created_at", { ascending: true }).limit(250),
    ctx.supabase.from("kb_collections").select("id, name").eq("id", doc.collection_id as string).maybeSingle(),
  ]);
  const pageMap = new Map<string, { url: string; title: string; chunks: number }>();
  for (const r of allPageRows ?? []) {
    const u = r.source_url as string | null;
    if (!u) continue;
    const cur = pageMap.get(u);
    if (cur) cur.chunks++;
    else pageMap.set(u, { url: u, title: (r.page_title as string | null) ?? u, chunks: 1 });
  }
  return {
    document: toDoc(doc, new Map(col ? [[col.id as string, col.name as string]] : [])),
    chunks: (chunks ?? []).map((c) => ({
      position: Number(c.position ?? 0),
      content: String(c.content ?? ""),
      sourceUrl: (c.source_url as string | null) ?? null,
      pageTitle: (c.page_title as string | null) ?? null,
    })),
    logs: (logs ?? []).map((l) => toLogDto(l as unknown as Row)),
    pages: [...pageMap.values()],
  };
}

export async function listDocumentLogs(
  ctx: AuthContext,
  documentId: string,
): Promise<{ document: DocumentDto; logs: IngestionLogDto[] }> {
  const doc = await loadDoc(ctx, documentId);
  const [{ data: logs }, { data: col }] = await Promise.all([
    ctx.supabase
      .from("kb_ingestion_logs")
      .select("id, document_id, level, stage, message, url, meta, created_at")
      .eq("document_id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: true })
      .limit(300),
    ctx.supabase.from("kb_collections").select("id, name").eq("id", doc.collection_id as string).maybeSingle(),
  ]);
  return {
    document: toDoc(doc, new Map(col ? [[col.id as string, col.name as string]] : [])),
    logs: (logs ?? []).map((l) => toLogDto(l as unknown as Row)),
  };
}

export async function listWorkspaceKnowledgeLogs(
  ctx: AuthContext,
  options: { documentId?: string; limit?: number } = {},
): Promise<{ logs: IngestionLogDto[]; documents: DocumentDto[] }> {
  const limit = Math.min(300, Math.max(20, options.limit ?? 150));
  let logQuery = ctx.supabase
    .from("kb_ingestion_logs")
    .select("id, document_id, level, stage, message, url, meta, created_at")
    .eq("workspace_id", ctx.workspaceId);
  if (options.documentId) {
    logQuery = logQuery.eq("document_id", options.documentId).order("created_at", { ascending: true }).limit(limit);
  } else {
    logQuery = logQuery.order("created_at", { ascending: false }).limit(limit);
  }

  const [logsRes, docsRes, colsRes] = await Promise.all([
    logQuery,
    ctx.supabase.from("kb_documents").select(DOC_COLUMNS).eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId),
  ]);
  if (logsRes.error) throw new Error("Failed to load knowledge logs");
  const colNames = new Map((colsRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const docs = (docsRes.data ?? []).map((d) => toDoc(d as unknown as Row, colNames));
  const docNames = new Map(docs.map((d) => [d.id, d.name]));
  const rows = (logsRes.data ?? []).map((l) => toLogDto(l as unknown as Row, docNames));
  if (!options.documentId) rows.reverse(); // chronological order for log console
  return { logs: rows, documents: docs };
}

/** A short-lived link to the original file, or the page address for URL documents. */
export async function documentDownloadUrl(ctx: AuthContext, id: string): Promise<{ url: string }> {
  const doc = await loadDoc(ctx, id);
  if (doc.kind === "url") return { url: doc.source_url as string };
  if (!doc.storage_path) throw Errors.notFound("File");
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(doc.storage_path as string, 60, { download: doc.name as string });
  if (error || !data) throw new Error("Failed to create the download link");
  return { url: data.signedUrl };
}

// ---------- indexing ----------
/**
 * Reads a document (or crawls a URL / sitemap / subpages), splits it into chunks, stores them in Supabase and,
 * when Milvus is configured, embeds and upserts them. Streams structured progress & logs to `kb_ingestion_logs`.
 * Runs with the service role and never throws: the outcome is written to the document row.
 */
export function processDocument(workspaceId: string, documentId: string): Promise<void> {
  return withUsageScope({ workspaceId, origin: "knowledge" }, () => processDocumentInner(workspaceId, documentId));
}

async function processDocumentInner(workspaceId: string, documentId: string): Promise<void> {
  const admin = createAdminClient();
  const finish = async (patch: Row) => {
    await admin.from("kb_documents").update(patch).eq("id", documentId).eq("workspace_id", workspaceId);
  };
  const log = async (level: ScrapeLogLevel, stage: string, message: string, url?: string | null, meta?: Record<string, unknown>) => {
    await writeIngestionLog(admin, workspaceId, documentId, level, stage, message, url, meta);
  };

  let docRef: { name: string; createdBy: string | null } | null = null;
  try {
    const { data: doc } = await admin
      .from("kb_documents")
      .select("id, collection_id, kind, name, source_url, storage_path, scrape_mode, scrape_config, created_by")
      .eq("id", documentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!doc) return;
    docRef = { name: String(doc.name), createdBy: (doc.created_by as string | null) ?? null };

    const chunkEntries: Array<{ content: string; sourceUrl: string | null; pageTitle: string | null }> = [];
    let title: string | null = null;
    let totalExtractedChars = 0;
    let pagesTotal = 0;
    let pagesScraped = 0;
    let pagesFailed = 0;

    if (doc.kind === "url") {
      const mode: ScrapeMode =
        doc.scrape_mode === "sitemap" || doc.scrape_mode === "subpages" ? doc.scrape_mode : "single";
      const cfg: ScrapeConfig =
        doc.scrape_config && typeof doc.scrape_config === "object" ? (doc.scrape_config as ScrapeConfig) : {};

      const scraped = await scrapeWebsite(doc.source_url as string, mode, cfg, {
        onLog: async (e) => {
          await log(e.level, e.stage, e.message, e.url ?? null, e.meta);
        },
        onProgress: async (p) => {
          pagesTotal = p.pagesTotal;
          pagesScraped = p.pagesScraped;
          pagesFailed = p.pagesFailed;
          await finish({
            progress_stage: p.stage,
            pages_total: p.pagesTotal,
            pages_scraped: p.pagesScraped,
            pages_failed: p.pagesFailed,
          });
        },
      });

      title = scraped.title;
      pagesTotal = scraped.totalDiscovered;
      pagesScraped = scraped.pages.length;
      pagesFailed = scraped.failedCount;

      await finish({ progress_stage: "chunking", pages_total: pagesTotal, pages_scraped: pagesScraped, pages_failed: pagesFailed });
      await log("info", "chunk", `Chunking content from ${scraped.pages.length} scraped page(s)...`);

      for (const page of scraped.pages) {
        totalExtractedChars += page.text.length;
        const pageChunks = chunkText(page.text);
        for (const piece of pageChunks) {
          if (chunkEntries.length >= MAX_CHUNKS_PER_DOC) break;
          const prefixed = scraped.pages.length > 1 ? `[${page.title} — ${page.url}]\n${piece}` : piece;
          chunkEntries.push({
            content: prefixed.slice(0, 3900),
            sourceUrl: page.url,
            pageTitle: page.title.slice(0, 300),
          });
        }
        if (chunkEntries.length >= MAX_CHUNKS_PER_DOC) {
          await log("warn", "chunk", `Reached max chunk cap (${MAX_CHUNKS_PER_DOC} chunks). Indexing collected passages.`);
          break;
        }
      }
    } else {
      await finish({ progress_stage: "extracting" });
      await log("info", "extract", `Downloading "${doc.name as string}" from storage and extracting ${(doc.kind as string).toUpperCase()} content...`);
      const dl = await admin.storage.from(BUCKET).download(doc.storage_path as string);
      if (dl.error || !dl.data) throw new KnowledgeError("The stored file could not be read.");
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const text = await extractFileText(doc.kind as FileDocKind, bytes, String(doc.name));
      totalExtractedChars = text.length;
      await log("success", "extract", `Extracted ${text.length.toLocaleString()} characters from "${doc.name as string}".`);

      await finish({ progress_stage: "chunking" });
      const pieces = chunkText(text).slice(0, MAX_CHUNKS_PER_DOC);
      for (const content of pieces) {
        chunkEntries.push({ content: content.slice(0, 3900), sourceUrl: null, pageTitle: null });
      }
    }

    if (!chunkEntries.length || totalExtractedChars < 20) {
      throw new KnowledgeError(
        doc.kind === "pdf"
          ? "No readable text was found. Scanned PDFs need OCR first."
          : "No readable text was found.",
      );
    }

    await log("info", "chunk", `Prepared ${chunkEntries.length} searchable chunk(s). Saving to database...`);

    // Start clean so a retry never duplicates chunks.
    await deleteVectors("document_id", documentId).catch(() => undefined);
    await admin.from("kb_chunks").delete().eq("document_id", documentId);
    const rows = chunkEntries.map((entry, position) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      collection_id: doc.collection_id as string,
      document_id: documentId,
      position,
      content: entry.content,
      source_url: entry.sourceUrl,
      page_title: entry.pageTitle,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin.from("kb_chunks").insert(rows.slice(i, i + 100));
      if (error) throw new Error("Failed to store chunks");
    }

    let vectorIndexed = false;
    let note: string | null = null;
    if (milvusConfig()) {
      await finish({ progress_stage: "embedding", chunk_count: rows.length });
      const totalBatches = Math.ceil(rows.length / EMBED_BATCH);
      await log("info", "embed", `Generating vector embeddings for ${rows.length} chunk(s) in ${totalBatches} batch(es)...`);
      try {
        const model = await kbEmbedModel();
        const vectors: number[][] = [];
        for (let i = 0; i < rows.length; i += EMBED_BATCH) {
          const batchNum = Math.floor(i / EMBED_BATCH) + 1;
          vectors.push(...(await embedMany(model, rows.slice(i, i + EMBED_BATCH).map((r) => r.content), "passage")).vectors);
          if (totalBatches > 1 && (batchNum === totalBatches || batchNum % 3 === 0)) {
            await log("info", "embed", `Embedded batch ${batchNum}/${totalBatches} (${Math.min(i + EMBED_BATCH, rows.length)}/${rows.length} chunks).`);
          }
        }
        await ensureCollection(vectors[0]!.length);
        await upsertVectors(rows.map((r, i) => ({ id: r.id, vector: vectors[i]!, workspace_id: workspaceId, collection_id: r.collection_id, document_id: documentId })));
        vectorIndexed = true;
        await log("success", "embed", `Upserted ${rows.length} vector embedding(s) into Milvus.`);
      } catch (e) {
        // Keep the document usable through keyword search and say what went wrong.
        note = `Searchable by keywords. Vector indexing failed: ${e instanceof ApiError ? e.message : "unexpected error"}`.slice(0, 480);
        await log("warn", "embed", note);
        console.error("[knowledge] vector indexing failed:", e instanceof Error ? e.message : "unknown");
      }
    } else {
      await log("info", "embed", "Milvus not configured — indexed for PostgreSQL full-text keyword search.");
    }

    const finalName = doc.kind === "url" && title ? title.slice(0, 300) : String(doc.name);
    const computedBytes = doc.kind === "url" ? new TextEncoder().encode(chunkEntries.map((c) => c.content).join("\n")).length : undefined;
    await finish({
      status: "indexed",
      progress_stage: "completed",
      error: note,
      chunk_count: rows.length,
      vector_indexed: vectorIndexed,
      indexed_at: new Date().toISOString(),
      ...(doc.kind === "url" && title ? { name: finalName } : {}),
      ...(computedBytes !== undefined ? { size_bytes: computedBytes } : {}),
      ...(doc.kind === "url" ? { pages_total: pagesTotal, pages_scraped: pagesScraped, pages_failed: pagesFailed } : {}),
    });
    await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).eq("id", doc.collection_id as string);
    await log(
      "success",
      "done",
      `Completed! Indexed ${rows.length} chunk(s)${doc.kind === "url" ? ` across ${pagesScraped} page(s)${pagesFailed ? ` (${pagesFailed} skipped)` : ""}` : ""} (${vectorIndexed ? "vector + keyword search" : "keyword search"}).`,
    );
    logEvent("vector", "info", `KB indexed "${finalName}" (${rows.length} chunks, vectors=${vectorIndexed})`, { workspaceId, documentId });

    const kbPayload = {
      kind: "kb_document_indexed",
      title: `Document indexed: ${finalName}`,
      body: `Ready for retrieval (${rows.length} chunk${rows.length === 1 ? "" : "s"}${doc.kind === "url" && pagesScraped > 1 ? ` from ${pagesScraped} pages` : ""}${vectorIndexed ? ", vector embedded" : ", keyword search"}).`,
    };
    if (docRef.createdBy) {
      await notify({ workspaceId, userId: docRef.createdBy, ...kbPayload });
    } else {
      await notifyOwners(workspaceId, kbPayload);
    }
  } catch (e) {
    const message = e instanceof KnowledgeError ? e.message : "This document could not be processed. Try again.";
    if (!(e instanceof KnowledgeError)) console.error("[knowledge] processing failed:", e instanceof Error ? e.message : "unknown");
    await log("error", "failed", message);
    await finish({ status: "failed", progress_stage: "failed", error: message.slice(0, 480), chunk_count: 0, vector_indexed: false });
    logEvent("vector", "error", `KB failed "${docRef?.name ?? documentId}": ${message}`, { workspaceId, documentId });
    if (docRef) {
      const failPayload = {
        kind: "kb_document_failed",
        title: `Document indexing failed: ${docRef.name}`,
        body: message.slice(0, 240),
      };
      if (docRef.createdBy) {
        await notify({ workspaceId, userId: docRef.createdBy, ...failPayload });
      } else {
        await notifyOwners(workspaceId, failPayload);
      }
    }
  }
}

// ---------- search and status ----------
export function searchKnowledge(ctx: AuthContext, query: string, collectionIds?: string[]): Promise<RetrievalResult> {
  return withUsageScope({ workspaceId: ctx.workspaceId, userId: ctx.userId, origin: "knowledge" }, () => searchKnowledgeInner(ctx, query, collectionIds));
}
async function searchKnowledgeInner(ctx: AuthContext, query: string, collectionIds?: string[]): Promise<RetrievalResult> {
  rateLimit(`kb-search:${ctx.userId}`, 30, 60_000);
  const { data } = await ctx.supabase.from("kb_collections").select("id").eq("workspace_id", ctx.workspaceId);
  const own = (data ?? []).map((c) => c.id as string);
  const ids = collectionIds?.length ? collectionIds.filter((c) => own.includes(c)) : own;
  return retrieve(ctx.workspaceId, ids, query, 6);
}

export async function knowledgeStatus(): Promise<KnowledgeStatusDto> {
  const cfg = milvusConfig();
  const [ping, model] = await Promise.all([cfg ? pingMilvus() : Promise.resolve(null), kbEmbedModel()]);
  const provider = await getProviderConfig(model.source);
  return {
    vector: { configured: Boolean(cfg), reachable: ping ? ping.ok : null, collection: cfg?.collection ?? null, message: ping && !ping.ok ? (ping.message ?? null) : null },
    embedModel: model.apiModelId,
    embeddingsReady: Boolean(process.env[provider.envKeyName]?.trim()),
  };
}
