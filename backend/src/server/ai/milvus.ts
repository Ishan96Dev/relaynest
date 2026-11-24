import "server-only";
import { milvusConfig } from "@backend/lib/env/vector";
import { ApiError, Errors } from "@backend/lib/http/api";

/** Thin client for the Milvus RESTful API v2 (works on self-hosted Milvus 2.4+ and Zilliz Cloud). No SDK needed. */
const TIMEOUT_MS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VectorRow { id: string; vector: number[]; workspace_id: string; collection_id: string; document_id: string }
export interface VectorHit { id: string; score: number }

export const milvusEnabled = () => milvusConfig() !== null;

async function call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cfg = milvusConfig();
  if (!cfg) throw new ApiError(503, "VECTOR_NOT_CONFIGURED", "The vector database is not configured. Add MILVUS_URI to .env.");
  let res: Response;
  try {
    res = await fetch(`${cfg.uri}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({ ...(cfg.dbName ? { dbName: cfg.dbName } : {}), ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw Errors.upstream("Could not reach the vector database. Check MILVUS_URI.");
  }
  if (res.status === 401 || res.status === 403) throw new ApiError(502, "VECTOR_AUTH", "The vector database rejected MILVUS_TOKEN.");
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: unknown } | null;
  if (!res.ok || !json) throw Errors.upstream("The vector database returned an error.");
  if (json.code !== 0 && json.code !== 200) {
    // Milvus messages describe schema and filter problems, not secrets, but keep them out of the browser anyway.
    console.error("[milvus]", path, json.code, String(json.message ?? "").slice(0, 300));
    if (json.code === 1800 || json.code === 1801 || /auth|permission|forbidden/i.test(String(json.message))) throw new ApiError(502, "VECTOR_AUTH", "The vector database rejected MILVUS_TOKEN.");
    throw Errors.upstream("The vector database could not complete the request.");
  }
  return json as Record<string, unknown>;
}

let ensured: { key: string; dim: number } | null = null;

/** Creates the collection on first use and checks the vector size afterwards. Cosine similarity, AUTOINDEX. */
export async function ensureCollection(dim: number): Promise<void> {
  const cfg = milvusConfig()!;
  const key = `${cfg.uri}|${cfg.dbName ?? ""}|${cfg.collection}`;
  if (ensured?.key === key && ensured.dim === dim) return;
  const has = (await call("/v2/vectordb/collections/has", { collectionName: cfg.collection })).data as { has?: boolean } | undefined;
  if (!has?.has) {
    await call("/v2/vectordb/collections/create", {
      collectionName: cfg.collection,
      schema: {
        autoID: false,
        enableDynamicField: false,
        fields: [
          { fieldName: "id", dataType: "VarChar", isPrimary: true, elementTypeParams: { max_length: "64" } },
          { fieldName: "vector", dataType: "FloatVector", elementTypeParams: { dim: String(dim) } },
          { fieldName: "workspace_id", dataType: "VarChar", elementTypeParams: { max_length: "64" } },
          { fieldName: "collection_id", dataType: "VarChar", elementTypeParams: { max_length: "64" } },
          { fieldName: "document_id", dataType: "VarChar", elementTypeParams: { max_length: "64" } },
        ],
      },
      indexParams: [{ fieldName: "vector", indexName: "vector_idx", metricType: "COSINE", params: { index_type: "AUTOINDEX" } }],
    });
    // Searching needs the collection loaded; creating it with an index normally loads it, and loading twice is harmless.
    await call("/v2/vectordb/collections/load", { collectionName: cfg.collection });
  } else {
    const d = (await call("/v2/vectordb/collections/describe", { collectionName: cfg.collection })).data as { fields?: { name: string; params?: { key: string; value: string }[] }[] } | undefined;
    const existing = Number(d?.fields?.find((f) => f.name === "vector")?.params?.find((p) => p.key === "dim")?.value);
    if (existing && existing !== dim) {
      throw new ApiError(502, "VECTOR_DIMENSION", `The Milvus collection "${cfg.collection}" stores ${existing}-dimension vectors but the embedding model returns ${dim}. Use a new MILVUS_COLLECTION name.`);
    }
  }
  ensured = { key, dim };
}

export async function upsertVectors(rows: VectorRow[]): Promise<void> {
  const cfg = milvusConfig()!;
  for (let i = 0; i < rows.length; i += 40) {
    await call("/v2/vectordb/entities/upsert", { collectionName: cfg.collection, data: rows.slice(i, i + 40) });
  }
}

/** Ids come from our own database (uuid), but they are still validated because they are placed inside a filter string. */
const quote = (ids: string[]) => ids.filter((i) => UUID.test(i)).map((i) => `"${i}"`).join(", ");

export async function searchVectors(vector: number[], workspaceId: string, collectionIds: string[], limit: number): Promise<VectorHit[]> {
  const cfg = milvusConfig()!;
  if (!UUID.test(workspaceId) || !quote(collectionIds)) return [];
  const has = (await call("/v2/vectordb/collections/has", { collectionName: cfg.collection })).data as { has?: boolean } | undefined;
  if (!has?.has) return [];
  const r = await call("/v2/vectordb/entities/search", {
    collectionName: cfg.collection,
    data: [vector],
    annsField: "vector",
    limit,
    filter: `workspace_id == "${workspaceId}" and collection_id in [${quote(collectionIds)}]`,
    outputFields: ["id"],
  });
  return ((r.data as { id?: string; distance?: number }[] | undefined) ?? []).filter((h) => typeof h.id === "string").map((h) => ({ id: h.id!, score: Number(h.distance ?? 0) }));
}

/** Removes vectors by one of the scope columns. A missing collection means there is nothing to delete. */
export async function deleteVectors(by: "document_id" | "collection_id", id: string): Promise<void> {
  const cfg = milvusConfig();
  if (!cfg || !UUID.test(id)) return;
  const has = (await call("/v2/vectordb/collections/has", { collectionName: cfg.collection })).data as { has?: boolean } | undefined;
  if (!has?.has) return;
  await call("/v2/vectordb/entities/delete", { collectionName: cfg.collection, filter: `${by} == "${id}"` });
}

/** Cheap reachability check for the status card. */
export async function pingMilvus(): Promise<{ ok: boolean; message?: string }> {
  try {
    await call("/v2/vectordb/collections/has", { collectionName: milvusConfig()!.collection });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : "Could not reach the vector database." };
  }
}
