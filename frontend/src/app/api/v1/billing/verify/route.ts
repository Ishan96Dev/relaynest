import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { verifyCheckout, verifyInput } from "@backend/server/billing/service";
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  return ok(await verifyCheckout(ctx, verifyInput.parse(await readJson(req))), {}, 200, requestId);
});
