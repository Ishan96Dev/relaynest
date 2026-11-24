import { z } from "zod";
import { ApiError, ok, readJson, route } from "@backend/lib/http/api";
import { hasTrustedOrigin } from "@backend/lib/security/phishing";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { enforceRateLimit, extractClientIp } from "@backend/server/security/rate-limit";
import { deleteApiKey, revokeApiKey, rotateApiKey } from "@backend/server/services/api-keys";

type Ctx = { params: Promise<{ keyId: string }> };

const actionSchema = z.object({
  action: z.enum(["revoke", "rotate"]),
});

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  await enforceRateLimit(`apikey-mut:${ctx.workspaceId}:${extractClientIp(req)}`, 30, 60_000);
  const keyId = uuid.parse((await params).keyId);
  const { action } = actionSchema.parse(await readJson(req));
  if (action === "rotate") {
    return ok(await rotateApiKey(ctx, keyId), {}, 200, requestId);
  }
  return ok({ key: await revokeApiKey(ctx, keyId) }, {}, 200, requestId);
});

export const DELETE = route<Ctx>(async (req, { params }, requestId) => {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  await enforceRateLimit(`apikey-mut:${ctx.workspaceId}:${extractClientIp(req)}`, 30, 60_000);
  const keyId = uuid.parse((await params).keyId);
  await deleteApiKey(ctx, keyId);
  return ok({ deleted: true }, {}, 200, requestId);
});
