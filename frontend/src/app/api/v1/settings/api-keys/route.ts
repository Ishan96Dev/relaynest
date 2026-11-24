import { ApiError, ok, readJson, route } from "@backend/lib/http/api";
import { hasTrustedOrigin } from "@backend/lib/security/phishing";
import { requireAuth } from "@backend/server/auth/context";
import { enforceRateLimit, extractClientIp } from "@backend/server/security/rate-limit";
import { createApiKey, createApiKeyInput, listApiKeysPageData } from "@backend/server/services/api-keys";
import { dispatchWorkspaceEvent } from "@backend/server/services/integrations";

export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  return ok(await listApiKeysPageData(ctx), {}, 200, requestId);
});

export const POST = route(async (req, _ctx, requestId) => {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  await enforceRateLimit(`apikey-create:${ctx.workspaceId}:${extractClientIp(req)}`, 20, 60_000);
  const input = createApiKeyInput.parse(await readJson(req));
  const res = await createApiKey(ctx, input);
  void dispatchWorkspaceEvent(ctx.workspaceId, "api_key.created", `API key "${input.name}" (${res.key.keyPrefix}•••) was generated.`);
  return ok(res, {}, 201, requestId);
});
