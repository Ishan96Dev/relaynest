import "server-only";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { demoActivity, demoBots, demoTrend } from "@/lib/demo-data";
import { requireAuth } from "@backend/server/auth/context";
import { listBots } from "@backend/server/repositories/bots";
import { getBotUsageStats } from "@backend/server/services/execution-trace";
import type { Bot } from "@/types";

export interface DashboardData {
  demo: boolean;
  bots: Bot[];
  totals: { bots: number; activeBots: number; messages: number; executions: number };
  quickStats: { executions7d: number; successRate: number; aiTokens7d: number; aiCostUsd7d: number };
  activity: { id: string; title: string; detail: string; when: string; tone: string }[];
  trend: { day: string; value: number }[];
}

function rel(iso: string | null) {
  if (!iso) return "No activity yet";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    return {
      demo: true,
      bots: demoBots,
      totals: { bots: 6, activeBots: 5, messages: 12430, executions: 24890 },
      quickStats: { executions7d: 3860, successRate: 97, aiTokens7d: 142000, aiCostUsd7d: 0.42 },
      activity: [...demoActivity],
      trend: demoTrend,
    };
  }
  const ctx = await requireAuth();
  const since = new Date(Date.now() - 6 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [{ bots }, execRes, logsRes, recentExecRes, aiRes, perBotExecRes] = await Promise.all([
    listBots(ctx, { limit: 50 }),
    ctx.supabase.from("executions").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId),
    ctx.supabase.from("activity_logs").select("id, action, detail, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(5),
    ctx.supabase.from("executions").select("status, started_at").eq("workspace_id", ctx.workspaceId).gte("started_at", since.toISOString()).limit(5000),
    ctx.supabase.from("ai_usage_events").select("total_tokens, cost_usd").eq("workspace_id", ctx.workspaceId).gte("created_at", since.toISOString()).limit(5000),
    ctx.supabase.from("executions").select("bot_id").eq("workspace_id", ctx.workspaceId).not("bot_id", "is", null).limit(5000),
  ]);

  const execCountByBot = new Map<string, number>();
  for (const r of perBotExecRes.data ?? []) {
    const id = r.bot_id as string | null;
    if (id) execCountByBot.set(id, (execCountByBot.get(id) ?? 0) + 1);
  }

  const perDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) perDay.set(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10), 0);
  let ok7d = 0;
  const recentRows = recentExecRes.data ?? [];
  for (const r of recentRows) {
    const day = (r.started_at as string).slice(0, 10);
    if (perDay.has(day)) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (r.status === "succeeded") ok7d++;
  }
  const aiRows = aiRes.data ?? [];
  const aiTokens7d = aiRows.reduce((s, r) => s + Number(r.total_tokens ?? 0), 0);
  const aiCostUsd7d = aiRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const botUsage = await getBotUsageStats(ctx, bots.map((b) => b.id));

  return {
    demo: false,
    bots: bots.map((b) => {
      const usage = botUsage.get(b.id) ?? { executionsCount: execCountByBot.get(b.id) ?? 0, activeUsers: 0 };
      const execCount = Math.max(execCountByBot.get(b.id) ?? 0, usage.executionsCount);
      const msgs = Math.max(b.messagesCount, execCount);
      return {
        id: b.id, publicId: b.publicId, name: b.name, username: b.username ?? "", avatarPath: b.avatarPath, description: b.description ?? "",
        welcomeMessage: b.welcomeMessage ?? "", defaultResponse: b.defaultResponse ?? "", status: b.status,
        webhookStatus: b.webhookStatus as Bot["webhookStatus"], messages: msgs, activeUsers: usage.activeUsers, executionsCount: execCount,
        lastActive: rel(b.lastUpdateAt), category: b.category ?? "", createdAt: new Date(b.createdAt).toLocaleDateString(),
      };
    }),
    totals: {
      bots: bots.length,
      activeBots: bots.filter((b) => b.status === "active").length,
      messages: bots.reduce((n, b) => n + Math.max(b.messagesCount, execCountByBot.get(b.id) ?? 0), 0),
      executions: execRes.count ?? 0,
    },
    quickStats: {
      executions7d: recentRows.length,
      successRate: recentRows.length ? Math.round((ok7d / recentRows.length) * 100) : 100,
      aiTokens7d,
      aiCostUsd7d,
    },
    activity: (logsRes.data ?? []).map((l) => ({ id: l.id as string, title: String(l.action), detail: String(l.detail ?? ""), when: rel(l.created_at as string), tone: "primary" })),
    trend: [...perDay].map(([d, value]) => ({ day: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), value })),
  };
}
