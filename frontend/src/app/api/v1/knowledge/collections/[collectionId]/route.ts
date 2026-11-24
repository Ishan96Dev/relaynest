import { ok, readJson, route } from "@backend/lib/http/api";
import { updateCollectionInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deleteCollection, updateCollection } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ collectionId: string }> };

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = updateCollectionInput.parse(await readJson(req));
  await updateCollection(ctx, uuid.parse((await params).collectionId), input);
  return ok({ updated: true }, {}, 200, requestId);
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  await deleteCollection(ctx, uuid.parse((await params).collectionId));
  return ok({ deleted: true }, {}, 200, requestId);
});
