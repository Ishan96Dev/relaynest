import { ApiError, fail, newRequestId } from "@backend/lib/http/api";
import { handleRazorpayWebhook } from "@backend/server/billing/service";
const MAX_BODY = 512 * 1024;
/** Razorpay webhook. Configure it in the Razorpay dashboard (Settings, Webhooks) and use the same secret as RAZORPAY_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const requestId = newRequestId();
  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(new ApiError(413, "PAYLOAD_TOO_LARGE", "Body is too large."), requestId);
  try {
    const outcome = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return Response.json({ status: outcome });
  } catch (e) {
    return fail(e, requestId);
  }
}
