import { ok, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { getUpiQrStatus } from "@backend/server/billing/service";
/** Polled while the QR is shown. Returns pending, paid (plan activated) or expired. */
export const GET = route<{ params: Promise<{ qrId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`upi-qr-status:${ctx.userId}`, 60, 60_000);
  return ok(await getUpiQrStatus(ctx, (await params).qrId), {}, 200, requestId);
});
