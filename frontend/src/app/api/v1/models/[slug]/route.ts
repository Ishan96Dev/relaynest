import { ok, route } from "@backend/lib/http/api";
import { modelSlug } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getModelBySlug } from "@backend/server/services/ai-models";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await getModelBySlug(ctx, modelSlug.parse((await params).slug)), {}, 200, requestId);
});
