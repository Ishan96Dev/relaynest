import { ok, route } from "@backend/lib/http/api";
import { requireAdmin } from "@backend/server/admin/auth";
import { getAdminUsersData } from "@backend/server/admin/console";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAdmin();
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  return ok(await getAdminUsersData(fresh), {}, 200, requestId);
});
