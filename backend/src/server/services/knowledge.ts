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
import { extractFileText, fetchPageText, KnowledgeError, kindFromFilename, MAX_FILE_BYTES, type DocKind } from "@backend/server/knowledge/extract";
import { getProviderConfig } from "@backend/server/services/ai-models";
import { kbEmbedModel, retrieve, type RetrievalResult } from "@backend/server/services/knowledge-retrieval";

const BUCKET = "knowledge";
const MAX_DOCS_PER_COLLECTION = 200;
const EMBED_BATCH = 16;

export interface CollectionDto {
  id: string; name: string; description: string; tone: "primary" | "info" | "success" | "amber";
  documents: number; sizeBytes: number; botIds: string[]; createdAt: string; updatedAt: string;
}
export interface DocumentDto {
  id: string; collectionId: string; collectionName: string; kind: DocKind; name: string; sourceUrl: string | null; sizeBytes: number;
  status: "uploaded" | "processing" | "indexed" | "failed"; error: string | null; chunkCount: number; vectorIndexed: boolean;
  createdAt: string; indexedAt: string | null;
}
export interface LinkableBotDto { id: string; name: string; username: string | null; status: string; kind: "agent" | "bot" }
export interface KnowledgeStatusDto { vector: { configured: boolean; reachable: boolean | null; collection: string | null; message: string | null }; embedModel: string; embeddingsReady: boolean }

type Row = Record<string, unknown>;
const DOC_COLUMNS = "id, collection_id, kind, name, source_url, size_bytes, status, error, chunk_count, vector_indexed, created_at, indexed_at";

function toDoc(r: Row, names: Map<string, string>): DocumentDto {
  return {
    id: r.id as string, collectionId: r.collection_id as string, collectionName: names.get(r.collection_id as string) ?? "", kind: r.kind as DocKind,
    name: r.name as string, sourceUrl: (r.source_url as string | null) ?? null, sizeBytes: Number(r.size_bytes ?? 0), status: r.status as DocumentDto["status"],
    error: (r.error as string | null) ?? null, chunkCount: Number(r.chunk_count ?? 0), vectorIndexed: Boolean(r.vector_indexed),
    createdAt: r.created_at as string, indexedAt: (r.indexed_at as string | null) ?? null,
  };
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
  await ownCollection(ctx, id);
  const admin = createAdminClient();
  const { data: docs } = await admin.from("kb_documents").select("storage_path").eq("collection_id", id).eq("workspace_id", ctx.workspaceId);
  await deleteVectors("collection_id", id).catch((e) => console.error("[knowledge] vector cleanup failed:", e instanceof Error ? e.message : "unknown"));
  const { error } = await ctx.supabase.from("kb_collections").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the collection");
  const paths = (docs ?? []).map((d) => d.storage_path as string | null).filter((p): p is string => Boolean(p));
  if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => undefined);
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
  return (docs.data ?? []).map((d) => toDoc(d, names));
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
  if (!kind || kind === "url") throw Errors.invalid("Only PDF, TXT and Markdown files can be uploaded.");
  if (file.size === 0) throw Errors.invalid("This file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Files can be up to 10 MB.");
  await assertRoom(ctx, collectionId);
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const path = `${ctx.workspaceId}/${id}/${safeName(file.name)}`;
  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw new Error("Failed to store the file");
  const { data, error } = await admin.from("kb_documents")
    .insert({ id, workspace_id: ctx.workspaceId, collection_id: collectionId, kind, name: file.name.slice(0, 300), storage_path: path, size_bytes: file.size, status: "processing", created_by: ctx.userId })
    .select(DOC_COLUMNS).single();
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new Error("Failed to save the document");
  }
  return toDoc(data, new Map([[collectionId, col.name]]));
}

export async function createUrlDocument(ctx: AuthContext, collectionId: string, url: string): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-upload:${ctx.userId}`, 30, 60_000);
  const col = await ownCollection(ctx, collectionId);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw Errors.invalid("Enter a valid URL."); }
  if (parsed.protocol !== "https:") throw Errors.invalid("Only HTTPS URLs can be added.");
  await assertRoom(ctx, collectionId);
  const { data, error } = await createAdminClient().from("kb_documents")
    .insert({ workspace_id: ctx.workspaceId, collection_id: collectionId, kind: "url", name: parsed.hostname + (parsed.pathname === "/" ? "" : parsed.pathname).slice(0, 200), source_url: parsed.toString(), status: "processing", created_by: ctx.userId })
    .select(DOC_COLUMNS).single();
  if (error) throw new Error("Failed to save the document");
  return toDoc(data, new Map([[collectionId, col.name]]));
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
  await loadDoc(ctx, id);
  const { data, error } = await createAdminClient().from("kb_documents").update({ status: "processing", error: null }).eq("id", id).eq("workspace_id", ctx.workspaceId).select(DOC_COLUMNS).single();
  if (error) throw new Error("Failed to restart indexing");
  const { data: col } = await ctx.supabase.from("kb_collections").select("id, name").eq("id", data.collection_id).maybeSingle();
  return toDoc(data, new Map(col ? [[col.id as string, col.name as string]] : []));
}

export async function previewDocument(ctx: AuthContext, id: string): Promise<{ document: DocumentDto; chunks: { position: number; content: string }[] }> {
  const doc = await loadDoc(ctx, id);
  const [{ data: chunks }, { data: col }] = await Promise.all([
    ctx.supabase.from("kb_chunks").select("position, content").eq("document_id", id).order("position").limit(12),
    ctx.supabase.from("kb_collections").select("id, name").eq("id", doc.collection_id as string).maybeSingle(),
  ]);
  return { document: toDoc(doc, new Map(col ? [[col.id as string, col.name as string]] : [])), chunks: (chunks ?? []) as { position: number; content: string }[] };
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
 * Reads a document, splits it into chunks, stores them in Supabase and, when Milvus is configured, embeds and upserts them.
 * Runs with the service role and never throws: the outcome is written to the document row.
 * Vector problems do not fail the document; it stays searchable by keyword and the note explains what to fix.
 */
export function processDocument(workspaceId: string, documentId: string): Promise<void> {
  return withUsageScope({ workspaceId, origin: "knowledge" }, () => processDocumentInner(workspaceId, documentId));
}
async function processDocumentInner(workspaceId: string, documentId: string): Promise<void> {
  const admin = createAdminClient();
  const finish = async (patch: Row) => {
    await admin.from("kb_documents").update(patch).eq("id", documentId).eq("workspace_id", workspaceId);
  };
  try {
    const { data: doc } = await admin.from("kb_documents").select("id, collection_id, kind, name, source_url, storage_path").eq("id", documentId).eq("workspace_id", workspaceId).maybeSingle();
    if (!doc) return;
    let text: string;
    let title: string | null = null;
    if (doc.kind === "url") {
      const page = await fetchPageText(doc.source_url as string);
      text = page.text;
      title = page.title;
    } else {
      const dl = await admin.storage.from(BUCKET).download(doc.storage_path as string);
      if (dl.error || !dl.data) throw new KnowledgeError("The stored file could not be read.");
      text = await extractFileText(doc.kind as Exclude<DocKind, "url">, new Uint8Array(await dl.data.arrayBuffer()));
    }
    const pieces = chunkText(text);
    if (!pieces.length || pieces.join("").trim().length < 20) {
      throw new KnowledgeError(doc.kind === "pdf" ? "No readable text was found. Scanned PDFs need OCR first." : "No readable text was found.");
    }
    // Start clean so a retry never duplicates chunks.
    await deleteVectors("document_id", documentId).catch(() => undefined);
    await admin.from("kb_chunks").delete().eq("document_id", documentId);
    const rows = pieces.map((content, position) => ({ id: crypto.randomUUID(), workspace_id: workspaceId, collection_id: doc.collection_id as string, document_id: documentId, position, content }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin.from("kb_chunks").insert(rows.slice(i, i + 100));
      if (error) throw new Error("Failed to store chunks");
    }
    let vectorIndexed = false;
    let note: string | null = null;
    if (milvusConfig()) {
      try {
        const model = await kbEmbedModel();
        const vectors: number[][] = [];
        for (let i = 0; i < rows.length; i += EMBED_BATCH) {
          vectors.push(...(await embedMany(model, rows.slice(i, i + EMBED_BATCH).map((r) => r.content), "passage")).vectors);
        }
        await ensureCollection(vectors[0]!.length);
        await upsertVectors(rows.map((r, i) => ({ id: r.id, vector: vectors[i]!, workspace_id: workspaceId, collection_id: r.collection_id, document_id: documentId })));
        vectorIndexed = true;
      } catch (e) {
        // Keep the document usable through keyword search and say what went wrong.
        note = `Searchable by keywords. Vector indexing failed: ${e instanceof ApiError ? e.message : "unexpected error"}`.slice(0, 480);
        console.error("[knowledge] vector indexing failed:", e instanceof Error ? e.message : "unknown");
      }
    }
    await finish({
      status: "indexed", error: note, chunk_count: rows.length, vector_indexed: vectorIndexed, indexed_at: new Date().toISOString(),
      ...(doc.kind === "url" && title ? { name: title.slice(0, 300) } : {}),
    });
    await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).eq("id", doc.collection_id as string);
  } catch (e) {
    const message = e instanceof KnowledgeError ? e.message : "This document could not be processed. Try again.";
    if (!(e instanceof KnowledgeError)) console.error("[knowledge] processing failed:", e instanceof Error ? e.message : "unknown");
    await finish({ status: "failed", error: message.slice(0, 480), chunk_count: 0, vector_indexed: false });
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
