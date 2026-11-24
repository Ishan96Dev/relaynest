import { ok, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { listModels } from "@backend/server/services/ai-models";

export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const models = await listModels(ctx);
  return ok(models, { total: models.length }, 200, requestId);
});
