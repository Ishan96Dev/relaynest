import { ok, readJson, route } from "@backend/lib/http/api";
import { documentCollectionsInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deleteDocument, previewDocument, updateDocumentCollections } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ documentId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await previewDocument(ctx, uuid.parse((await params).documentId)), {}, 200, requestId);
});

/** Reassigns or shares a document across collections, syncing Supabase and Milvus vectors. */
export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = documentCollectionsInput.parse(await readJson(req));
  const result = await updateDocumentCollections(ctx, uuid.parse((await params).documentId), input.collectionIds);
  return ok(result, {}, 200, requestId);
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  await deleteDocument(ctx, uuid.parse((await params).documentId));
  return ok({ deleted: true }, {}, 200, requestId);
});
