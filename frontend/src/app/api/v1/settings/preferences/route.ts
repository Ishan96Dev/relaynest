import { ApiError, ok, readJson, route } from "@backend/lib/http/api";
import { userPreferencesPatchSchema } from "@backend/lib/preferences";
import { hasTrustedOrigin } from "@backend/lib/security/phishing";
import { requireAuth } from "@backend/server/auth/context";
import { rateLimit } from "@backend/server/security/rate-limit";
import {
  getUserPreferences,
  resetUserPreferences,
  saveUserPreferences,
} from "@backend/server/services/preferences";

export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const data = await getUserPreferences(ctx);
  return ok(data, {}, 200, requestId);
});

async function handleSave(req: Request, requestId: string) {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  rateLimit(`prefs:${ctx.userId}`, 60, 60_000);
  const patch = userPreferencesPatchSchema.parse(await readJson(req, 32 * 1024));
  const data = await saveUserPreferences(ctx, patch);
  return ok(data, {}, 200, requestId);
}

export const PUT = route(async (req, _ctx, requestId) => handleSave(req, requestId));
export const PATCH = route(async (req, _ctx, requestId) => handleSave(req, requestId));

export const DELETE = route(async (req, _ctx, requestId) => {
  if (!hasTrustedOrigin(req)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site request blocked.");
  const ctx = await requireAuth();
  rateLimit(`prefs:${ctx.userId}`, 30, 60_000);
  const data = await resetUserPreferences(ctx);
  return ok(data, {}, 200, requestId);
});
