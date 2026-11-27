import "server-only";
import {
  extractActorFromPayload,
  normalizeExecutionBounds,
  parseTriggerInfo,
  percentile,
  type CommandStatRow,
  type ExecutionSummaryItem,
} from "@backend/lib/execution-format";
import { requireAuth } from "../auth/context";
import { enrichExecutionSummaries, getBotUsageStats } from "./execution-trace";

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
      id: a.id as string,
      name: a.name as string,
      description: (a.description as string | null) ?? "",
      status: a.status as string,
      updatedAt: a.updated_at as string,
      workflowId: flows[0]?.id ?? null,
    };
  });
}

export type ExecutionRow = ExecutionSummaryItem;

function relOne<T>(val: unknown): T | null {
  if (!val) return null;
  return (Array.isArray(val) ? val[0] : val) as T | null;
}

export async function listExecutions(limit = 100): Promise<ExecutionSummaryItem[]> {
  const ctx = await requireAuth();
  const [execRes, aiRes] = await Promise.all([
    ctx.supabase
      .from("executions")
      .select("id, bot_id, workflow_id, trigger_type, status, started_at, finished_at, duration_ms, error_code, error_message_safe, trigger_payload, bots(name, telegram_username), workflows(name)")
      .eq("workspace_id", ctx.workspaceId)
      .order("started_at", { ascending: false })
      .limit(limit),
    ctx.supabase
      .from("ai_usage_events")
      .select("id, source, model_slug, api_model_id, kind, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, provider_request_id, created_at, bot_id, execution_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("origin", "agent")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rows = (execRes.data ?? []).map((e) => {
    const bot = relOne<{ name: string; telegram_username: string | null }>(e.bots);
    const wf = relOne<{ name: string }>(e.workflows);
    return {
      id: String(e.id),
      bot_id: (e.bot_id as string | null) ?? null,
      workflow_id: (e.workflow_id as string | null) ?? null,
      trigger_type: String(e.trigger_type),
      status: String(e.status),
      started_at: String(e.started_at),
      finished_at: (e.finished_at as string | null) ?? null,
      duration_ms: (e.duration_ms as number | null) ?? null,
      error_code: (e.error_code as string | null) ?? null,
      error_message_safe: (e.error_message_safe as string | null) ?? null,
      trigger_payload: (e.trigger_payload as Record<string, unknown> | null) ?? null,
      botName: bot?.name ?? wf?.name ?? "Workflow",
      botUsername: bot?.telegram_username ?? null,
      workflowName: wf?.name ?? null,
    };
  });

  return enrichExecutionSummaries(ctx, rows, (aiRes.data ?? []) as never[]);
}

export interface AnalyticsBotRow {
  botId: string | null;
  botName: string;
  botUsername: string | null;
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number;
  activeUsers: number;
}

export interface AnalyticsData {
  days: number;
  total: number;
  succeeded: number;
  failed: number;
  commandRuns: number;
  workflowRuns: number;
  activeUsers: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  /** Executions per day, oldest first. */
  trend: { day: string; value: number }[];
  dailyStatus: { day: string; succeeded: number; failed: number }[];
  byTrigger: CommandStatRow[];
  byBot: AnalyticsBotRow[];
  recent: ExecutionSummaryItem[];
}

export async function getAnalytics(days = 7): Promise<AnalyticsData> {
  const ctx = await requireAuth();
  const windowDays = days === 30 ? 30 : 7;
  const since = new Date(Date.now() - (windowDays - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [execRes, aiRes, botsRes] = await Promise.all([
    ctx.supabase
      .from("executions")
      .select("id, bot_id, workflow_id, trigger_type, status, started_at, finished_at, duration_ms, error_code, error_message_safe, trigger_payload, bots(id, name, telegram_username), workflows(name)")
      .eq("workspace_id", ctx.workspaceId)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false })
      .limit(5000),
    ctx.supabase
      .from("ai_usage_events")
      .select("id, source, model_slug, api_model_id, kind, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, provider_request_id, created_at, bot_id, execution_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("origin", "agent")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    ctx.supabase.from("bots").select("id").eq("workspace_id", ctx.workspaceId).limit(100),
  ]);

  const botIds = (botsRes.data ?? []).map((b) => String(b.id));
  const botStats = await getBotUsageStats(ctx, botIds);

  const rawRows = execRes.data ?? [];
  const normalized = rawRows.map((e) => {
    const bounds = normalizeExecutionBounds(
      String(e.started_at),
      (e.finished_at as string | null) ?? null,
      (e.duration_ms as number | null) ?? null,
    );
    const bot = relOne<{ id: string; name: string; telegram_username: string | null }>(e.bots);
    const wf = relOne<{ name: string }>(e.workflows);
    return {
      id: String(e.id),
      bot_id: (e.bot_id as string | null) ?? null,
      workflow_id: (e.workflow_id as string | null) ?? null,
      trigger_type: String(e.trigger_type),
      status: String(e.status),
      started_at: bounds.startedAt,
      finished_at: bounds.finishedAt,
      duration_ms: bounds.durationMs,
      error_code: (e.error_code as string | null) ?? null,
      error_message_safe: (e.error_message_safe as string | null) ?? null,
      trigger_payload: (e.trigger_payload as Record<string, unknown> | null) ?? null,
      botName: bot?.name ?? wf?.name ?? "Workflow",
      botUsername: bot?.telegram_username ?? null,
      workflowName: wf?.name ?? null,
    };
  });

  const perDay = new Map<string, { total: number; succeeded: number; failed: number }>();
  for (let i = 0; i < windowDays; i++) {
    perDay.set(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10), { total: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  let commandRuns = 0;
  let workflowRuns = 0;
  const durations: number[] = [];
  const userIds = new Set<string>();
  const triggers = new Map<string, { trigger: string; count: number; succeeded: number; failed: number; durations: number[]; tokens: number }>();
  const bots = new Map<string, { botId: string | null; botName: string; botUsername: string | null; total: number; succeeded: number; failed: number; durations: number[] }>();

  for (const r of normalized) {
    const day = r.started_at.slice(0, 10);
    const slot = perDay.get(day);
    if (slot) {
      slot.total += 1;
      if (r.status === "succeeded") slot.succeeded += 1;
      if (r.status === "failed") slot.failed += 1;
    }
    if (r.status === "succeeded") succeeded += 1;
    if (r.status === "failed") failed += 1;
    if (typeof r.duration_ms === "number") durations.push(r.duration_ms);
    if (r.workflow_id) workflowRuns += 1;
    else commandRuns += 1;

    const actor = extractActorFromPayload(r.trigger_payload);
    const uid = actor.userId ?? actor.chatId;
    if (uid) userIds.add(uid);

    const trig = r.trigger_type || "unknown";
    const t = triggers.get(trig) ?? { trigger: trig, count: 0, succeeded: 0, failed: 0, durations: [], tokens: 0 };
    t.count += 1;
    if (r.status === "succeeded") t.succeeded += 1;
    if (r.status === "failed") t.failed += 1;
    if (typeof r.duration_ms === "number") t.durations.push(r.duration_ms);
    triggers.set(trig, t);

    const bKey = r.bot_id ?? r.botName;
    const b = bots.get(bKey) ?? {
      botId: r.bot_id,
      botName: r.botName,
      botUsername: r.botUsername,
      total: 0,
      succeeded: 0,
      failed: 0,
      durations: [],
    };
    b.total += 1;
    if (r.status === "succeeded") b.succeeded += 1;
    if (r.status === "failed") b.failed += 1;
    if (typeof r.duration_ms === "number") b.durations.push(r.duration_ms);
    bots.set(bKey, b);
  }

  // Attribute tokens to triggers
  const aiRows = (aiRes.data ?? []) as Array<{
    execution_id?: string | null;
    total_tokens?: number;
    created_at: string;
  }>;
  const execWindows = normalized.map((r) => {
    const s = Date.parse(r.started_at);
    const f = r.finished_at ? Date.parse(r.finished_at) : s + (r.duration_ms ?? 0);
    return { id: r.id, trigger: r.trigger_type, start: s - 2_500, end: f + 2_500 };
  });
  for (const u of aiRows) {
    const tok = Number(u.total_tokens ?? 0);
    if (tok <= 0) continue;
    const hit = u.execution_id
      ? execWindows.find((w) => w.id === u.execution_id)
      : execWindows.find((w) => {
          const t = Date.parse(u.created_at);
          return Number.isFinite(t) && t >= w.start && t <= w.end;
        });
    if (hit) {
      const entry = triggers.get(hit.trigger);
      if (entry) entry.tokens += tok;
    }
  }

  // Also include historical active users from ai_agent_messages via botStats
  let totalBotUsers = 0;
  for (const s of botStats.values()) totalBotUsers += s.activeUsers;

  const recent = await enrichExecutionSummaries(ctx, normalized.slice(0, 40), (aiRes.data ?? []) as never[]);

  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", windowDays > 7 ? { month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", timeZone: "UTC" });

  const durationSum = durations.reduce((a, b) => a + b, 0);

  return {
    days: windowDays,
    total: normalized.length,
    succeeded,
    failed,
    commandRuns,
    workflowRuns,
    activeUsers: Math.max(userIds.size, totalBotUsers),
    avgDurationMs: durations.length ? Math.round(durationSum / durations.length) : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    minDurationMs: durations.length ? Math.min(...durations) : 0,
    maxDurationMs: durations.length ? Math.max(...durations) : 0,
    trend: [...perDay].map(([d, v]) => ({ day: fmtDay(d), value: v.total })),
    dailyStatus: [...perDay].map(([d, v]) => ({ day: fmtDay(d), succeeded: v.succeeded, failed: v.failed })),
    byTrigger: [...triggers.values()]
      .map((t) => {
        const info = parseTriggerInfo(t.trigger);
        const avg = t.durations.length ? Math.round(t.durations.reduce((a, b) => a + b, 0) / t.durations.length) : 0;
        return {
          trigger: t.trigger,
          label: info.label,
          category: info.category,
          count: t.count,
          succeeded: t.succeeded,
          failed: t.failed,
          successRate: t.count ? Math.round((t.succeeded / t.count) * 100) : 0,
          avgDurationMs: avg,
          p95DurationMs: percentile(t.durations, 0.95),
          totalTokens: t.tokens,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    byBot: [...bots.values()]
      .map((b) => ({
        botId: b.botId,
        botName: b.botName,
        botUsername: b.botUsername,
        total: b.total,
        succeeded: b.succeeded,
        failed: b.failed,
        avgDurationMs: b.durations.length ? Math.round(b.durations.reduce((a, x) => a + x, 0) / b.durations.length) : 0,
        activeUsers: b.botId ? (botStats.get(b.botId)?.activeUsers ?? 0) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    recent,
  };
}
