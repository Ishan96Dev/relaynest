import "server-only";
import { requireAuth } from "../auth/context";

/** Rows for the Automations, Execution History and Analytics pages. All reads go through RLS as the signed-in member. */

export interface AgentRow {
  id: string;
  name: string;
  description: string;
  status: string;
  updatedAt: string;
  /** Newest workflow of the agent, used for the editor link. */
  workflowId: string | null;
}

export async function listAgents(): Promise<AgentRow[]> {
  const ctx = await requireAuth();
  const { data } = await ctx.supabase
    .from("agents")
    .select("id, name, description, status, updated_at, workflows(id, created_at)")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((a) => {
    const flows = ((a.workflows ?? []) as { id: string; created_at: string }[]).sort((x, y) => y.created_at.localeCompare(x.created_at));
    return {
      id: a.id as string, name: a.name as string, description: (a.description as string | null) ?? "", status: a.status as string,
      updatedAt: a.updated_at as string, workflowId: flows[0]?.id ?? null,
    };
  });
}

export interface ExecutionRow {
  id: string;
  botName: string;
  trigger: string;
  status: string;
  durationMs: number | null;
  startedAt: string;
  error: string | null;
}

export async function listExecutions(limit = 50): Promise<ExecutionRow[]> {
  const ctx = await requireAuth();
  const { data } = await ctx.supabase
    .from("executions")
    .select("id, trigger_type, status, duration_ms, started_at, error_message_safe, bots(name)")
    .eq("workspace_id", ctx.workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((e) => {
    const bot = e.bots as { name: string } | { name: string }[] | null;
    return {
      id: e.id as string, botName: (Array.isArray(bot) ? bot[0]?.name : bot?.name) ?? "-", trigger: e.trigger_type as string,
      status: e.status as string, durationMs: (e.duration_ms as number | null) ?? null, startedAt: e.started_at as string,
      error: (e.error_message_safe as string | null) ?? null,
    };
  });
}

export interface AnalyticsData {
  days: number;
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number;
  p95DurationMs: number;
  /** Executions per day, oldest first. */
  trend: { day: string; value: number }[];
  dailyStatus: { day: string; succeeded: number; failed: number }[];
  byTrigger: { trigger: string; count: number }[];
  byBot: { botName: string; total: number; succeeded: number; failed: number }[];
  recent: ExecutionRow[];
}

export async function getAnalytics(days = 7): Promise<AnalyticsData> {
  const ctx = await requireAuth();
  const windowDays = days === 30 ? 30 : 7;
  const since = new Date(Date.now() - (windowDays - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await ctx.supabase
    .from("executions")
    .select("id, trigger_type, status, duration_ms, started_at, error_message_safe, bots(name)")
    .eq("workspace_id", ctx.workspaceId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(5000);
  const rows = data ?? [];
  const perDay = new Map<string, { total: number; succeeded: number; failed: number }>();
  for (let i = 0; i < windowDays; i++) {
    perDay.set(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10), { total: 0, succeeded: 0, failed: 0 });
  }
  let succeeded = 0, failed = 0, durationSum = 0;
  const durations: number[] = [];
  const triggers = new Map<string, number>();
  const bots = new Map<string, { botName: string; total: number; succeeded: number; failed: number }>();

  for (const r of rows) {
    const day = (r.started_at as string).slice(0, 10);
    const slot = perDay.get(day);
    if (slot) {
      slot.total++;
      if (r.status === "succeeded") slot.succeeded++;
      if (r.status === "failed") slot.failed++;
    }
    if (r.status === "succeeded") succeeded++;
    if (r.status === "failed") failed++;
    if (typeof r.duration_ms === "number") { durationSum += r.duration_ms; durations.push(r.duration_ms); }
    const trig = String(r.trigger_type || "unknown");
    triggers.set(trig, (triggers.get(trig) ?? 0) + 1);
    const botRel = r.bots as { name: string } | { name: string }[] | null;
    const botName = (Array.isArray(botRel) ? botRel[0]?.name : botRel?.name) ?? "Workflow";
    const b = bots.get(botName) ?? { botName, total: 0, succeeded: 0, failed: 0 };
    b.total++;
    if (r.status === "succeeded") b.succeeded++;
    if (r.status === "failed") b.failed++;
    bots.set(botName, b);
  }
  durations.sort((a, b) => a - b);
  const p95DurationMs = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0 : 0;
  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", windowDays > 7 ? { month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", timeZone: "UTC" });

  return {
    days: windowDays,
    total: rows.length,
    succeeded,
    failed,
    avgDurationMs: durations.length ? Math.round(durationSum / durations.length) : 0,
    p95DurationMs,
    trend: [...perDay].map(([d, v]) => ({ day: fmtDay(d), value: v.total })),
    dailyStatus: [...perDay].map(([d, v]) => ({ day: fmtDay(d), succeeded: v.succeeded, failed: v.failed })),
    byTrigger: [...triggers.entries()].map(([trigger, count]) => ({ trigger, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    byBot: [...bots.values()].sort((a, b) => b.total - a.total).slice(0, 6),
    recent: rows.slice(0, 10).map((e) => {
      const botRel = e.bots as { name: string } | { name: string }[] | null;
      return {
        id: e.id as string,
        botName: (Array.isArray(botRel) ? botRel[0]?.name : botRel?.name) ?? "-",
        trigger: e.trigger_type as string,
        status: e.status as string,
        durationMs: (e.duration_ms as number | null) ?? null,
        startedAt: e.started_at as string,
        error: (e.error_message_safe as string | null) ?? null,
      };
    }),
  };
}
