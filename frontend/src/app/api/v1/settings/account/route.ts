import { z } from "zod";
import { ApiError, ok, readJson, route } from "@backend/lib/http/api";
import { hasTrustedOrigin } from "@backend/lib/security/phishing";
import { requireAuth } from "@backend/server/auth/context";
import { enforceRateLimit, extractClientIp } from "@backend/server/security/rate-limit";
import { deleteUserAccount } from "@backend/server/services/account";

const schema = z.object({
  confirmText: z.literal("DELETE"),
});

export const DELETE = route(async (req, _ctx, requestId) => {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  await enforceRateLimit(`account-delete:${ctx.userId}:${extractClientIp(req)}`, 5, 600_000);

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "CONFIRM_REQUIRED", "Type DELETE exactly to confirm permanent account deletion.");
  }

  const result = await deleteUserAccount(ctx);
  return ok(result, {}, 200, requestId);
});
