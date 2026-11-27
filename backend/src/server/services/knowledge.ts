import "server-only";
import type { z } from "zod";
import { milvusConfig } from "@backend/lib/env/vector";
import { ApiError, Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import type { collectionInput, updateCollectionInput } from "@backend/lib/validation/schemas";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import {
  deleteVectors,
  ensureCollection,
  pingMilvus,
  updateVectorsCollection,
  upsertVectors,
} from "@backend/server/ai/milvus";
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

export interface CollectionDocSummary {
  id: string;
  name: string;
  kind: DocKind;
  status: "uploaded" | "processing" | "indexed" | "failed";
  chunkCount: number;
  vectorIndexed: boolean;
  sizeBytes: number;
}
export interface CollectionDto {
  id: string; name: string; description: string; tone: "primary" | "info" | "success" | "amber";
  documents: number; sizeBytes: number; botIds: string[];
  documentIds: string[];
  documentItems: CollectionDocSummary[];
  createdAt: string; updatedAt: string;
}
export interface DocumentDto {
  id: string;
  collectionId: string;
  collectionName: string;
  collectionIds: string[];
  collectionNames: string[];
  kind: DocKind;
  name: string;
  sourceUrl: string | null;
  sizeBytes: number;
  status: "uploaded" | "processing" | "indexed" | "failed";
  error: string | null;
  chunkCount: number;
  vectorIndexed: boolean;
  scrapeMode: ScrapeMode;
  scrapeConfig: ScrapeConfig;
  progressStage: string | null;
  pagesTotal: number;
  pagesScraped: number;
  pagesFailed: number;
  createdAt: string;
  indexedAt: string | null;
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

function toDoc(
  r: Row,
  colNames: Map<string, string>,
  docCollectionIds?: Map<string, string[]>,
): DocumentDto {
  const rawMode = r.scrape_mode as string | undefined;
  const scrapeMode: ScrapeMode = rawMode === "sitemap" || rawMode === "subpages" ? rawMode : "single";
  const rawCfg = r.scrape_config && typeof r.scrape_config === "object" ? (r.scrape_config as ScrapeConfig) : {};
  const primaryId = r.collection_id as string;
  const linked = docCollectionIds?.get(r.id as string) ?? [];
  const uniqueIds = [primaryId, ...linked.filter((cid) => cid !== primaryId)].filter(Boolean);
  return {
    id: r.id as string,
    collectionId: primaryId,
    collectionName: colNames.get(primaryId) ?? "",
    collectionIds: uniqueIds,
    collectionNames: uniqueIds.map((cid) => colNames.get(cid) ?? "").filter(Boolean),
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

/**
 * Syncs a document's primary `collection_id` across Supabase (`kb_documents`, `kb_chunks`) and Milvus Vector DB.
 * Uses in-place Milvus query+upsert so existing embeddings stay intact without re-calling the embedding model;
 * if vectors are missing for an indexed vector document, gracefully re-embeds them from `kb_chunks`.
 */
async function syncPrimaryCollectionEverywhere(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  documentId: string,
  newPrimaryCollectionId: string,
): Promise<{ vectorSynced: boolean; vectorsUpdated: number }> {
  await Promise.all([
    admin.from("kb_documents").update({ collection_id: newPrimaryCollectionId }).eq("id", documentId).eq("workspace_id", workspaceId),
    admin.from("kb_chunks").update({ collection_id: newPrimaryCollectionId }).eq("document_id", documentId).eq("workspace_id", workspaceId),
  ]);

  if (!milvusConfig()) {
    return { vectorSynced: false, vectorsUpdated: 0 };
  }

  try {
    const res = await updateVectorsCollection(workspaceId, documentId, newPrimaryCollectionId);
    if (res.updated > 0) {
      return { vectorSynced: true, vectorsUpdated: res.updated };
    }
    // If document is marked vector_indexed (or has chunks while Milvus is enabled), check if we should upsert from kb_chunks.
    const { data: docRow } = await admin
      .from("kb_documents")
      .select("status, vector_indexed")
      .eq("id", documentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (docRow?.status === "indexed" && docRow.vector_indexed) {
      const { data: chunkRows } = await admin
        .from("kb_chunks")
        .select("id, content")
        .eq("document_id", documentId)
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true });
      if (chunkRows?.length) {
        const model = await kbEmbedModel();
        const vectors: number[][] = [];
        for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
          vectors.push(
            ...(await embedMany(model, chunkRows.slice(i, i + EMBED_BATCH).map((c) => String(c.content)), "passage")).vectors,
          );
        }
        await ensureCollection(vectors[0]!.length);
        await upsertVectors(
          chunkRows.map((c, idx) => ({
            id: c.id as string,
            vector: vectors[idx]!,
            workspace_id: workspaceId,
            collection_id: newPrimaryCollectionId,
            document_id: documentId,
          })),
        );
        return { vectorSynced: true, vectorsUpdated: chunkRows.length };
      }
    }
    return { vectorSynced: true, vectorsUpdated: 0 };
  } catch (e) {
    console.error("[knowledge] Milvus collection sync failed:", e instanceof Error ? e.message : "unknown");
    return { vectorSynced: false, vectorsUpdated: 0 };
  }
}

// ---------- collections ----------
export async function listCollections(ctx: AuthContext): Promise<CollectionDto[]> {
  const [cols, docs, docLinks, botLinks] = await Promise.all([
    ctx.supabase.from("kb_collections").select("id, name, description, tone, created_at, updated_at").eq("workspace_id", ctx.workspaceId).order("updated_at", { ascending: false }),
    ctx.supabase.from("kb_documents").select("id, collection_id, name, kind, status, chunk_count, vector_indexed, size_bytes, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }),
    ctx.supabase.from("kb_collection_documents").select("collection_id, document_id").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_bot_links").select("collection_id, bot_id").eq("workspace_id", ctx.workspaceId),
  ]);
  if (cols.error || docs.error || botLinks.error) throw new Error("Failed to load collections");

  const docById = new Map<string, CollectionDocSummary>();
  const colToDocIds = new Map<string, Set<string>>();
  for (const d of docs.data ?? []) {
    const id = d.id as string;
    const cid = d.collection_id as string;
    docById.set(id, {
      id,
      name: String(d.name ?? ""),
      kind: d.kind as DocKind,
      status: d.status as CollectionDocSummary["status"],
      chunkCount: Number(d.chunk_count ?? 0),
      vectorIndexed: Boolean(d.vector_indexed),
      sizeBytes: Number(d.size_bytes ?? 0),
    });
    if (cid) {
      let set = colToDocIds.get(cid);
      if (!set) { set = new Set(); colToDocIds.set(cid, set); }
      set.add(id);
    }
  }
  for (const l of docLinks.data ?? []) {
    const cid = l.collection_id as string;
    const did = l.document_id as string;
    if (!docById.has(did)) continue;
    let set = colToDocIds.get(cid);
    if (!set) { set = new Set(); colToDocIds.set(cid, set); }
    set.add(did);
  }

  return (cols.data ?? []).map((c) => {
    const ids = [...(colToDocIds.get(c.id as string) ?? [])];
    const items = ids.map((id) => docById.get(id)!).filter(Boolean);
    return {
      id: c.id as string,
      name: c.name as string,
      description: c.description as string,
      tone: c.tone as CollectionDto["tone"],
      documents: items.length,
      sizeBytes: items.reduce((s, d) => s + d.sizeBytes, 0),
      botIds: (botLinks.data ?? []).filter((l) => l.collection_id === c.id).map((l) => l.bot_id as string),
      documentIds: items.map((d) => d.id),
      documentItems: items,
      createdAt: c.created_at as string,
      updatedAt: c.updated_at as string,
    };
  });
}

async function ownCollection(ctx: AuthContext, id: string): Promise<{ id: string; name: string }> {
  const { data } = await ctx.supabase.from("kb_collections").select("id, name").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!data) throw Errors.notFound("Collection");
  return data as { id: string; name: string };
}

async function ownCollections(ctx: AuthContext, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const { data } = await ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId).in("id", unique);
  if ((data ?? []).length !== unique.length) throw Errors.invalid("One of the selected collections was not found.");
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
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
  const initialDocIds = [...new Set(input.documentIds ?? [])];
  if (initialDocIds.length > 0) {
    await setCollectionDocuments(ctx, data.id as string, initialDocIds);
  }
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "kb_collection_created",
    title: `Knowledge collection created: ${data.name as string}`,
    body: initialDocIds.length
      ? `Created with ${initialDocIds.length} assigned knowledge ${initialDocIds.length === 1 ? "document" : "documents"}.`
      : "Upload PDF, Word, Excel, CSV, PowerPoint, Markdown, TXT, JSON, HTML files or crawl websites & sitemaps.",
  });
  const fresh = (await listCollections(ctx)).find((c) => c.id === data.id);
  return fresh ?? {
    id: data.id,
    name: data.name,
    description: data.description,
    tone: data.tone,
    documents: 0,
    sizeBytes: 0,
    botIds: [],
    documentIds: [],
    documentItems: [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateCollection(ctx: AuthContext, id: string, input: z.infer<typeof updateCollectionInput>): Promise<void> {
  requireWrite(ctx);
  await ownCollection(ctx, id);
  const { documentIds, ...fields } = input;
  if (Object.keys(fields).length > 0) {
    const { error } = await ctx.supabase.from("kb_collections").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) {
      if (error.code === "23505") throw Errors.conflict("A collection with this name already exists.");
      throw new Error("Failed to update the collection");
    }
  }
  if (documentIds !== undefined) {
    await setCollectionDocuments(ctx, id, documentIds);
  }
}

export async function deleteCollection(ctx: AuthContext, id: string): Promise<void> {
  requireWrite(ctx);
  const col = await ownCollection(ctx, id);
  const admin = createAdminClient();
  const [{ data: primaryDocs }, { data: allLinks }] = await Promise.all([
    admin.from("kb_documents").select("id, storage_path").eq("collection_id", id).eq("workspace_id", ctx.workspaceId),
    admin.from("kb_collection_documents").select("collection_id, document_id").eq("workspace_id", ctx.workspaceId),
  ]);

  const otherColByDoc = new Map<string, string>();
  for (const l of allLinks ?? []) {
    const cid = l.collection_id as string;
    const did = l.document_id as string;
    if (cid !== id && !otherColByDoc.has(did)) otherColByDoc.set(did, cid);
  }

  const exclusivePaths: string[] = [];
  for (const d of primaryDocs ?? []) {
    const docId = d.id as string;
    const fallbackCol = otherColByDoc.get(docId);
    if (fallbackCol) {
      // Preserve shared documents by promoting another assigned collection to primary in Supabase + Milvus.
      await syncPrimaryCollectionEverywhere(admin, ctx.workspaceId, docId, fallbackCol);
    } else {
      await deleteVectors("document_id", docId).catch((e) => console.error("[knowledge] vector cleanup failed:", e instanceof Error ? e.message : "unknown"));
      if (d.storage_path) exclusivePaths.push(d.storage_path as string);
    }
  }

  const { error } = await ctx.supabase.from("kb_collections").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the collection");
  if (exclusivePaths.length) await admin.storage.from(BUCKET).remove(exclusivePaths).catch(() => undefined);
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "kb_collection_deleted",
    title: `Knowledge collection deleted: ${col.name}`,
    body: "The collection and its exclusive documents were removed; shared documents remain in their other collections.",
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

/**
 * Assigns/unassigns which knowledge documents belong to a collection/project.
 * Keeps `kb_collection_documents`, `kb_documents`, `kb_chunks`, and Milvus vector DB fully in sync.
 */
export async function setCollectionDocuments(
  ctx: AuthContext,
  collectionId: string,
  documentIds: string[],
): Promise<{ documentIds: string[]; vectorSyncedCount: number }> {
  requireWrite(ctx);
  const col = await ownCollection(ctx, collectionId);
  const unique = [...new Set(documentIds)];
  if (unique.length > MAX_DOCS_PER_COLLECTION) {
    throw Errors.invalid(`A collection holds up to ${MAX_DOCS_PER_COLLECTION} documents.`);
  }

  const admin = createAdminClient();
  if (unique.length) {
    const { data } = await admin.from("kb_documents").select("id").eq("workspace_id", ctx.workspaceId).in("id", unique);
    if ((data ?? []).length !== unique.length) throw Errors.invalid("One of the selected documents was not found.");
  }

  const [{ data: allLinks }, { data: allDocs }] = await Promise.all([
    admin.from("kb_collection_documents").select("collection_id, document_id").eq("workspace_id", ctx.workspaceId),
    admin.from("kb_documents").select("id, name, collection_id").eq("workspace_id", ctx.workspaceId),
  ]);

  const docMeta = new Map((allDocs ?? []).map((d) => [d.id as string, { name: String(d.name), primaryId: d.collection_id as string }]));
  const docToCols = new Map<string, Set<string>>();
  for (const d of allDocs ?? []) {
    docToCols.set(d.id as string, new Set([d.collection_id as string]));
  }
  for (const l of allLinks ?? []) {
    const set = docToCols.get(l.document_id as string);
    if (set) set.add(l.collection_id as string);
  }

  const currentInCol = new Set<string>();
  for (const [did, cols] of docToCols.entries()) {
    if (cols.has(collectionId)) currentInCol.add(did);
  }

  const add = unique.filter((did) => !currentInCol.has(did));
  const drop = [...currentInCol].filter((did) => !unique.includes(did));

  // Verify none of the removed documents would become orphaned (0 collections).
  for (const did of drop) {
    const cols = docToCols.get(did) ?? new Set();
    const others = [...cols].filter((c) => c !== collectionId);
    if (others.length === 0) {
      const name = docMeta.get(did)?.name ?? "document";
      throw Errors.invalid(
        `"${name}" only belongs to "${col.name}". Assign it to another collection first before removing it here.`,
      );
    }
  }

  const touchedCollections = new Set<string>([collectionId]);
  let vectorSyncedCount = 0;

  if (add.length) {
    const { error } = await admin
      .from("kb_collection_documents")
      .upsert(
        add.map((document_id) => ({ collection_id: collectionId, document_id, workspace_id: ctx.workspaceId })),
        { onConflict: "collection_id,document_id" },
      );
    if (error) throw new Error("Failed to assign documents to collection");
    for (const did of add) {
      await writeIngestionLog(admin, ctx.workspaceId, did, "info", "assign", `Assigned to collection "${col.name}".`);
    }
  }

  if (drop.length) {
    for (const did of drop) {
      const meta = docMeta.get(did);
      const others = [...(docToCols.get(did) ?? [])].filter((c) => c !== collectionId);
      const nextPrimary = others[0]!;
      if (meta?.primaryId === collectionId) {
        const sync = await syncPrimaryCollectionEverywhere(admin, ctx.workspaceId, did, nextPrimary);
        if (sync.vectorSynced) vectorSyncedCount += sync.vectorsUpdated;
        touchedCollections.add(nextPrimary);
      }
      await admin
        .from("kb_collection_documents")
        .delete()
        .eq("collection_id", collectionId)
        .eq("document_id", did)
        .eq("workspace_id", ctx.workspaceId);
      await writeIngestionLog(admin, ctx.workspaceId, did, "info", "assign", `Removed from collection "${col.name}".`);
    }
  }

  const now = new Date().toISOString();
  await admin.from("kb_collections").update({ updated_at: now }).in("id", [...touchedCollections]).eq("workspace_id", ctx.workspaceId);
  return { documentIds: unique, vectorSyncedCount };
}

/**
 * Moves or assigns a single document to one or more collections/projects.
 * Synchronizes Supabase (`kb_collection_documents`, `kb_documents`, `kb_chunks`) and Milvus Vector DB in-place.
 */
export async function updateDocumentCollections(
  ctx: AuthContext,
  documentId: string,
  collectionIds: string[],
): Promise<{ document: DocumentDto; vectorSynced: boolean; vectorsUpdated: number }> {
  requireWrite(ctx);
  const doc = await loadDoc(ctx, documentId);
  const unique = [...new Set(collectionIds)];
  if (!unique.length) throw Errors.invalid("Assign this document to at least one collection.");

  const colNames = await ownCollections(ctx, unique);
  const admin = createAdminClient();

  const { data: existingLinks } = await admin
    .from("kb_collection_documents")
    .select("collection_id")
    .eq("document_id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  const prevSet = new Set<string>([doc.collection_id as string, ...(existingLinks ?? []).map((r) => r.collection_id as string)]);
  const add = unique.filter((cid) => !prevSet.has(cid));
  const drop = [...prevSet].filter((cid) => !unique.includes(cid));

  for (const cid of add) {
    await assertRoom(ctx, cid);
  }

  const newPrimary = unique[0]!;
  const primaryChanged = newPrimary !== (doc.collection_id as string);

  if (add.length) {
    const { error } = await admin
      .from("kb_collection_documents")
      .upsert(
        add.map((collection_id) => ({ collection_id, document_id: documentId, workspace_id: ctx.workspaceId })),
        { onConflict: "collection_id,document_id" },
      );
    if (error) throw new Error("Failed to assign collections");
  }
  if (drop.length) {
    const { error } = await admin
      .from("kb_collection_documents")
      .delete()
      .eq("document_id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .in("collection_id", drop);
    if (error) throw new Error("Failed to remove old collection assignments");
  }
  // Ensure primary link always exists in kb_collection_documents
  await admin
    .from("kb_collection_documents")
    .upsert({ collection_id: newPrimary, document_id: documentId, workspace_id: ctx.workspaceId }, { onConflict: "collection_id,document_id" });

  let vectorSynced = false;
  let vectorsUpdated = 0;
  if (primaryChanged) {
    const sync = await syncPrimaryCollectionEverywhere(admin, ctx.workspaceId, documentId, newPrimary);
    vectorSynced = sync.vectorSynced;
    vectorsUpdated = sync.vectorsUpdated;
  } else if (milvusConfig()) {
    vectorSynced = true;
  }

  const affected = [...new Set([...prevSet, ...unique])];
  await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).in("id", affected).eq("workspace_id", ctx.workspaceId);

  const assignedLabels = unique.map((cid) => colNames.get(cid) ?? cid).join(", ");
  await writeIngestionLog(
    admin,
    ctx.workspaceId,
    documentId,
    "success",
    "assign",
    `Updated collection assignment -> [${assignedLabels}]${primaryChanged && vectorSynced ? ` (Supabase + ${vectorsUpdated} Milvus vector${vectorsUpdated === 1 ? "" : "s"} synced)` : " (Supabase synced)"}.`,
  );

  const freshDoc = (await listDocuments(ctx)).find((d) => d.id === documentId);
  if (!freshDoc) throw Errors.notFound("Document");
  return { document: freshDoc, vectorSynced, vectorsUpdated };
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
  const [docs, cols, links] = await Promise.all([
    ctx.supabase.from("kb_documents").select(DOC_COLUMNS).eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(500),
    ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_collection_documents").select("collection_id, document_id").eq("workspace_id", ctx.workspaceId),
  ]);
  if (docs.error) throw new Error("Failed to load documents");
  const names = new Map((cols.data ?? []).map((c) => [c.id as string, c.name as string]));
  const docColMap = new Map<string, string[]>();
  for (const l of links.data ?? []) {
    const did = l.document_id as string;
    const cid = l.collection_id as string;
    const arr = docColMap.get(did) ?? [];
    if (!arr.includes(cid)) arr.push(cid);
    docColMap.set(did, arr);
  }
  const all = (docs.data ?? []).map((d) => toDoc(d as unknown as Row, names, docColMap));
  return collectionId ? all.filter((d) => d.collectionIds.includes(collectionId)) : all;
}

async function assertRoom(ctx: AuthContext, collectionId: string) {
  const { count } = await ctx.supabase
    .from("kb_collection_documents")
    .select("document_id", { count: "exact", head: true })
    .eq("collection_id", collectionId)
    .eq("workspace_id", ctx.workspaceId);
  if ((count ?? 0) >= MAX_DOCS_PER_COLLECTION) throw Errors.invalid(`A collection holds up to ${MAX_DOCS_PER_COLLECTION} documents.`);
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";

/** Stores an uploaded file and assigns it to one or more collections. Call processDocument afterwards. */
export async function createFileDocument(
  ctx: AuthContext,
  collectionId: string,
  file: File,
  extraCollectionIds?: string[],
): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-upload:${ctx.userId}`, 30, 60_000);
  const allColIds = [...new Set([collectionId, ...(extraCollectionIds ?? [])])];
  const colNames = await ownCollections(ctx, allColIds);
  const kind = kindFromFilename(file.name);
  if (!kind || kind === "url") {
    throw Errors.invalid("Unsupported file type. Upload PDF, Word (.docx/.doc/.odt/.rtf), Excel (.xlsx/.xls/.ods), CSV/TSV, PowerPoint (.pptx/.odp), TXT, Markdown, JSON/YAML/XML, or HTML.");
  }
  if (file.size === 0) throw Errors.invalid("This file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Files can be up to 10 MB.");
  for (const cid of allColIds) await assertRoom(ctx, cid);

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const path = `${ctx.workspaceId}/${id}/${safeName(file.name)}`;
  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw new Error("Failed to store the file");
  const { data, error } = await admin.from("kb_documents")
    .insert({
      id,
      workspace_id: ctx.workspaceId,
      collection_id: allColIds[0]!,
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
  await admin
    .from("kb_collection_documents")
    .upsert(
      allColIds.map((cid) => ({ collection_id: cid, document_id: id, workspace_id: ctx.workspaceId })),
      { onConflict: "collection_id,document_id" },
    );
  const assignedNames = allColIds.map((cid) => colNames.get(cid) ?? cid).join(", ");
  await writeIngestionLog(
    admin,
    ctx.workspaceId,
    id,
    "info",
    "queued",
    `Uploaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${kind.toUpperCase()}) into [${assignedNames}]. Queued for text extraction.`,
  );
  return toDoc(data as unknown as Row, colNames, new Map([[id, allColIds]]));
}

export async function createUrlDocument(
  ctx: AuthContext,
  collectionId: string,
  rawUrl: string,
  options: { mode?: ScrapeMode; config?: ScrapeConfig; extraCollectionIds?: string[] } = {},
): Promise<DocumentDto> {
  requireWrite(ctx);
  rateLimit(`kb-upload:${ctx.userId}`, 30, 60_000);
  const allColIds = [...new Set([collectionId, ...(options.extraCollectionIds ?? [])])];
  const colNames = await ownCollections(ctx, allColIds);
  let parsed: URL;
  try {
    parsed = normalizePublicUrl(rawUrl);
  } catch (e) {
    throw Errors.invalid(e instanceof Error ? e.message : "Enter a valid public HTTPS URL.");
  }
  for (const cid of allColIds) await assertRoom(ctx, cid);

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
      collection_id: allColIds[0]!,
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
  const docId = data.id as string;
  await admin
    .from("kb_collection_documents")
    .upsert(
      allColIds.map((cid) => ({ collection_id: cid, document_id: docId, workspace_id: ctx.workspaceId })),
      { onConflict: "collection_id,document_id" },
    );
  const assignedNames = allColIds.map((cid) => colNames.get(cid) ?? cid).join(", ");
  const modeDesc =
    mode === "sitemap"
      ? `sitemap scrape (up to ${cfg.maxPages ?? 15} pages)`
      : mode === "subpages"
        ? `subpages crawl (up to ${cfg.maxPages ?? 15} pages, depth ${cfg.maxDepth ?? 2})`
        : "single page scrape";
  await writeIngestionLog(admin, ctx.workspaceId, docId, "info", "queued", `Queued ${modeDesc} for ${parsed.toString()} into [${assignedNames}].`, parsed.toString());
  return toDoc(data as unknown as Row, colNames, new Map([[docId, allColIds]]));
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
  const { data: links } = await admin.from("kb_collection_documents").select("collection_id").eq("document_id", id).eq("workspace_id", ctx.workspaceId);
  const affectedCols = [...new Set([doc.collection_id as string, ...(links ?? []).map((l) => l.collection_id as string)])];
  await deleteVectors("document_id", id).catch((e) => console.error("[knowledge] vector cleanup failed:", e instanceof Error ? e.message : "unknown"));
  const { error } = await admin.from("kb_documents").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the document");
  if (doc.storage_path) await admin.storage.from(BUCKET).remove([doc.storage_path as string]).catch(() => undefined);
  await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).in("id", affectedCols);
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
  const [{ data: cols }, { data: links }] = await Promise.all([
    ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_collection_documents").select("collection_id").eq("document_id", id),
  ]);
  const colNames = new Map((cols ?? []).map((c) => [c.id as string, c.name as string]));
  return toDoc(data as unknown as Row, colNames, new Map([[id, (links ?? []).map((l) => l.collection_id as string)]]));
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
  const [{ data: chunks }, { data: allPageRows }, { data: logs }, { data: cols }, { data: links }] = await Promise.all([
    ctx.supabase.from("kb_chunks").select("position, content, source_url, page_title").eq("document_id", id).order("position").limit(20),
    ctx.supabase.from("kb_chunks").select("source_url, page_title").eq("document_id", id).not("source_url", "is", null).limit(500),
    ctx.supabase.from("kb_ingestion_logs").select("id, document_id, level, stage, message, url, meta, created_at").eq("document_id", id).order("created_at", { ascending: true }).limit(250),
    ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_collection_documents").select("collection_id").eq("document_id", id),
  ]);
  const pageMap = new Map<string, { url: string; title: string; chunks: number }>();
  for (const r of allPageRows ?? []) {
    const u = r.source_url as string | null;
    if (!u) continue;
    const cur = pageMap.get(u);
    if (cur) cur.chunks++;
    else pageMap.set(u, { url: u, title: (r.page_title as string | null) ?? u, chunks: 1 });
  }
  const colNames = new Map((cols ?? []).map((c) => [c.id as string, c.name as string]));
  return {
    document: toDoc(doc, colNames, new Map([[id, (links ?? []).map((l) => l.collection_id as string)]])),
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
  const [{ data: logs }, { data: cols }, { data: links }] = await Promise.all([
    ctx.supabase
      .from("kb_ingestion_logs")
      .select("id, document_id, level, stage, message, url, meta, created_at")
      .eq("document_id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: true })
      .limit(300),
    ctx.supabase.from("kb_collections").select("id, name").eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("kb_collection_documents").select("collection_id").eq("document_id", documentId),
  ]);
  const colNames = new Map((cols ?? []).map((c) => [c.id as string, c.name as string]));
  return {
    document: toDoc(doc, colNames, new Map([[documentId, (links ?? []).map((l) => l.collection_id as string)]])),
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

  const [logsRes, docs] = await Promise.all([logQuery, listDocuments(ctx)]);
  if (logsRes.error) throw new Error("Failed to load knowledge logs");
  const docNames = new Map(docs.map((d) => [d.id, d.name]));
  const rows = (logsRes.data ?? []).map((l) => toLogDto(l as unknown as Row, docNames));
  if (!options.documentId) rows.reverse();
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

    // Re-read current primary collection_id in case the user reassigned it while scraping was in progress!
    const { data: latestDoc } = await admin
      .from("kb_documents")
      .select("collection_id")
      .eq("id", documentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const activeCollectionId = (latestDoc?.collection_id as string | undefined) ?? (doc.collection_id as string);

    await log("info", "chunk", `Prepared ${chunkEntries.length} searchable chunk(s). Saving to database...`);

    await deleteVectors("document_id", documentId).catch(() => undefined);
    await admin.from("kb_chunks").delete().eq("document_id", documentId);
    const rows = chunkEntries.map((entry, position) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      collection_id: activeCollectionId,
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
        await upsertVectors(rows.map((r, i) => ({ id: r.id, vector: vectors[i]!, workspace_id: workspaceId, collection_id: activeCollectionId, document_id: documentId })));
        vectorIndexed = true;
        await log("success", "embed", `Upserted ${rows.length} vector embedding(s) into Milvus.`);
      } catch (e) {
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
    const { data: assignedLinks } = await admin.from("kb_collection_documents").select("collection_id").eq("document_id", documentId);
    const colsToTouch = [...new Set([activeCollectionId, ...(assignedLinks ?? []).map((l) => l.collection_id as string)])];
    await admin.from("kb_collections").update({ updated_at: new Date().toISOString() }).in("id", colsToTouch);
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
