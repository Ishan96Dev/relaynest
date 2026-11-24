import { ok, readJson, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { checkoutInput, createCheckout } from "@backend/server/billing/service";
/** Creates a Razorpay order (one-time) or subscription (recurring) for the browser to open in Razorpay Checkout. */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`checkout:${ctx.userId}`, 10, 60_000);
  return ok(await createCheckout(ctx, checkoutInput.parse(await readJson(req))), {}, 200, requestId);
});
