import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { validateWorkflow } from "@backend/server/workflow-engine";

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth();
  return ok(validateWorkflow(await readJson(req, 512 * 1024)), {}, 200, requestId);
});
