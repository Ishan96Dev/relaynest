import { ok, readJson, route } from "@backend/lib/http/api";
import { knowledgeSearchInput } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { searchKnowledge } from "@backend/server/services/knowledge";

export const maxDuration = 60;

/** Semantic search over the workspace's collections (vectors when Milvus is configured, keywords otherwise). */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const input = knowledgeSearchInput.parse(await readJson(req));
  const r = await searchKnowledge(ctx, input.query, input.collectionIds);
  return ok({
    mode: r.mode,
    results: r.passages.map((p) => ({ chunkId: p.chunkId, documentId: p.documentId, document: p.source, collection: p.collectionName, content: p.content, score: p.score })),
  }, {}, 200, requestId);
});
