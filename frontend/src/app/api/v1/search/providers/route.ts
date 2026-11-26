import { ok, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { loadSearchProvidersFromDb } from "@backend/server/services/search-providers";

/** Lists active web search providers from Supabase `public.search_providers` with live readiness flags (never exposes keys). */
export const GET = route(async (_req, _ctx, requestId) => {
  await requireAuth();
  const providers = await loadSearchProvidersFromDb();
  return ok({ providers }, {}, 200, requestId);
});
