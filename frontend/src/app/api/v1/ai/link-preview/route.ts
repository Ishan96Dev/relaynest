import { isSupabaseConfigured } from "@backend/lib/env/public";
import { Errors, ok, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { fetchLinkPreview } from "@backend/server/search/link-preview";
import { enforceRateLimit, extractClientIp } from "@backend/server/security/rate-limit";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

/** Returns safe OpenGraph / HTML link preview metadata for a public HTTPS URL. */
export const GET = route(async (req, _ctx, requestId) => {
  const rlKey = isSupabaseConfigured()
    ? `lp:${(await requireAuth()).userId}`
    : `lp:demo:${extractClientIp(req)}`;
  await enforceRateLimit(rlKey, 60, 60_000);

  const rawUrl = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!rawUrl) throw Errors.invalid("A valid https:// url query parameter is required.");

  let safeUrl: string;
  try {
    safeUrl = assertSafeOutboundUrl(rawUrl).toString();
  } catch (e) {
    throw Errors.invalid(e instanceof Error ? e.message : "Invalid URL.");
  }

  const data = await fetchLinkPreview(safeUrl);
  const res = ok(data, {}, 200, requestId);
  res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
});
