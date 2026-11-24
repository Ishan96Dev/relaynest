import { ok, route } from "@backend/lib/http/api";
import { requireAdmin } from "@backend/server/admin/auth";
import { getAdminAuditData } from "@backend/server/admin/console";

export const GET = route(async (_req, _ctx, requestId) => {
  await requireAdmin();
  return ok(await getAdminAuditData(), {}, 200, requestId);
});
