import { ok, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { getBillingOverview } from "@backend/server/billing/service";
export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  return ok(await getBillingOverview(ctx), {}, 200, requestId);
});
