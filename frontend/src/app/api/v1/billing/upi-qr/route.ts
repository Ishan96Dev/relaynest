import { ok, readJson, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { createUpiQrCheckout, upiQrInput } from "@backend/server/billing/service";
/** Creates a fixed-amount Razorpay UPI QR (INR, one-time) for the browser to display. */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`upi-qr:${ctx.userId}`, 10, 60_000);
  return ok(await createUpiQrCheckout(ctx, upiQrInput.parse(await readJson(req))), {}, 200, requestId);
});
