import { ok, readJson, route } from "@backend/lib/http/api";
import { collectionInput } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { createCollection, listCollections } from "@backend/server/services/knowledge";

export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  return ok(await listCollections(ctx), {}, 200, requestId);
});

export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const input = collectionInput.parse(await readJson(req));
  return ok(await createCollection(ctx, input), {}, 201, requestId);
});
