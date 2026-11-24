import { ok, route } from "@backend/lib/http/api";
import { requireAdmin } from "@backend/server/admin/auth";
import { getAdminSecurityWarningsData } from "@backend/server/admin/console";

export const GET = route(async (_req, _ctx, requestId) => {
  await requireAdmin();
  return ok(await getAdminSecurityWarningsData(), {}, 200, requestId);
});
