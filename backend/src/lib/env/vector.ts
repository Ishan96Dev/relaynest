import "server-only";
/**
 * Milvus (or Zilliz Cloud) connection for the Knowledge Base. Entirely optional: without MILVUS_URI the Knowledge Base
 * still works and retrieves with Postgres full-text search instead of vectors.
 */
export interface MilvusConfig { uri: string; token: string | undefined; dbName: string | undefined; collection: string }
export function milvusConfig(): MilvusConfig | null {
  const uri = process.env.MILVUS_URI?.trim().replace(/\/+$/, "");
  if (!uri) return null;
  const collection = process.env.MILVUS_COLLECTION?.trim() || "relaynest_knowledge";
  return {
    uri,
    token: process.env.MILVUS_TOKEN?.trim() || undefined,
    dbName: process.env.MILVUS_DB_NAME?.trim() || undefined,
    collection: /^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(collection) ? collection : "relaynest_knowledge",
  };
}
