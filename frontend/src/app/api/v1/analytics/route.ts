import { ok, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { listBots } from "@backend/server/repositories/bots";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "analytics:read", async (ctx) => {
    const since = new Date(Date.now() - 6 * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);

    const [{ bots }, execRes, recentExecRes, aiRes, apiLogRes] = await Promise.all([
      listBots(ctx, { limit: 100 }),
      ctx.supabase.from("executions").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId),
      ctx.supabase.from("executions").select("status, started_at").eq("workspace_id", ctx.workspaceId).gte("started_at", since.toISOString()).limit(5000),
      ctx.supabase.from("ai_usage_events").select("total_tokens, cost_usd").eq("workspace_id", ctx.workspaceId).gte("created_at", since.toISOString()).limit(5000),
      ctx.supabase.from("api_request_logs").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId).gte("created_at", since.toISOString()),
    ]);

    const recentRows = recentExecRes.data ?? [];
    const ok7d = recentRows.filter((r) => r.status === "succeeded").length;
    const aiRows = aiRes.data ?? [];
    return ok(
      {
        totals: {
          bots: bots.length,
          activeBots: bots.filter((b) => b.status === "active").length,
          messages: bots.reduce((n, b) => n + b.messagesCount, 0),
          executions: execRes.count ?? 0,
          apiRequests7d: apiLogRes.count ?? 0,
        },
        quickStats: {
          executions7d: recentRows.length,
          successRate: recentRows.length ? Math.round((ok7d / recentRows.length) * 100) : 100,
          aiTokens7d: aiRows.reduce((s, r) => s + Number(r.total_tokens ?? 0), 0),
          aiCostUsd7d: Number(aiRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0).toFixed(6)),
        },
      },
      {},
      200,
      requestId,
    );
  }),
);
