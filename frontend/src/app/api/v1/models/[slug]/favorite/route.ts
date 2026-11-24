import { ok, route } from "@backend/lib/http/api";
import { modelSlug } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { setFavorite } from "@backend/server/services/ai-models";

type Ctx = { params: Promise<{ slug: string }> };

/** Adds the model to the caller's favourites. */
export const PUT = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await setFavorite(ctx, modelSlug.parse((await params).slug), true), {}, 200, requestId);
});

/** Removes the model from the caller's favourites. */
export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await setFavorite(ctx, modelSlug.parse((await params).slug), false), {}, 200, requestId);
});
