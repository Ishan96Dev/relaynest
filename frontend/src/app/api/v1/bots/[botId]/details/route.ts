import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getBotAnalytics } from "@backend/server/services/execution-trace";

/** Returns rich per-bot analytics, linked workflows, command/model breakdowns, and enriched executions. */
export const GET = route<{ params: Promise<{ botId: string }> }>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const botId = uuid.parse((await params).botId);
  const rawRange = new URL(req.url).searchParams.get("days");
  const range: "7" | "30" | "all" = rawRange === "7" ? "7" : rawRange === "all" ? "all" : "30";
  const payload = await getBotAnalytics(ctx, botId, range);
  return ok(payload, {}, 200, requestId);
});
