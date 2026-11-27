"use client";

import {
  Activity,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Eye,
  Gauge,
  Hash,
  Layers,
  MessageSquare,
  RefreshCw,
  Route,
  Search,
  Users,
} from "lucide-react";
import * as React from "react";
import {
  formatCostUsd,
  formatDuration,
  providerDisplayName,
  triggerCategoryLabel,
  type BotAnalyticsPayload,
  type ExecutionSummaryItem,
} from "@backend/lib/execution-format";
import { formatUserDateTime } from "@backend/lib/preferences";
import { ExecutionDetailModal } from "@/components/analytics/execution-detail-modal";
import { StatusBars, TrendChart } from "@/components/charts/lazy-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RANGES: Array<{ id: "7" | "30" | "all"; label: string }> = [
  { id: "7", label: "Last 7 Days" },
  { id: "30", label: "Last 30 Days" },
  { id: "all", label: "All Time" },
];

export function BotAnalyticsPanel({
  botUsername,
  data,
  range,
  loading,
  demo,
  onRangeChange,
  onRefresh,
}: {
  botUsername?: string;
  data: BotAnalyticsPayload | null;
  range: "7" | "30" | "all";
  loading: boolean;
  demo: boolean;
  onRangeChange: (next: "7" | "30" | "all") => void;
  onRefresh: () => void;
}) {
  const { prefs } = usePreferences();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "succeeded" | "failed">("all");
  const [triggerFilter, setTriggerFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<ExecutionSummaryItem | null>(null);

  const executions = React.useMemo(() => data?.executions ?? [], [data]);
  const triggerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.byCommand ?? []) map.set(c.trigger, c.label);
    for (const e of executions) if (!map.has(e.triggerType)) map.set(e.triggerType, e.triggerLabel);
    return [...map.entries()];
  }, [data, executions]);

  const filteredExecutions = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return executions.filter((ex) => {
      if (statusFilter !== "all" && ex.status !== statusFilter) return false;
      if (triggerFilter !== "all" && ex.triggerType !== triggerFilter) return false;
      if (!q) return true;
      return (
        ex.triggerLabel.toLowerCase().includes(q) ||
        ex.triggerType.toLowerCase().includes(q) ||
        (ex.inputPreview ?? "").toLowerCase().includes(q) ||
        (ex.actorLabel ?? "").toLowerCase().includes(q) ||
        (ex.modelLabel ?? "").toLowerCase().includes(q) ||
        (ex.errorCode ?? "").toLowerCase().includes(q) ||
        ex.id.toLowerCase().includes(q)
      );
    });
  }, [executions, search, statusFilter, triggerFilter]);

  const maxCmdCount = Math.max(1, ...(data?.byCommand ?? []).map((c) => c.count));
  const maxDur = Math.max(1, ...filteredExecutions.map((e) => e.durationMs ?? 0));

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-72 rounded-2xl" />
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-5">
      {/* Range switcher & refresh controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Bot Analytics &amp; Command Telemetry</h2>
          <p className="text-xs text-muted">
            Click any command execution below to inspect its full step-by-step journey (Command Called &rarr; AI Model &rarr; Output Sent to Telegram).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Analytics time range" className="flex rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRangeChange(r.id)}
                className={cn("rounded-md px-3 py-1.5 transition", range === r.id ? "btn-primary-bg text-white" : "text-muted hover:text-foreground")}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <section aria-label="Bot analytics summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Executions"
          value={s.periodExecutions.toLocaleString()}
          note={`${s.succeeded.toLocaleString()} ok · ${s.failed.toLocaleString()} err (${s.totalExecutions.toLocaleString()} all-time)`}
          icon={<Layers />}
          tone="primary"
          hint="Total command, AI message, and workflow runs for this bot"
        />
        <StatCard
          label="Success Rate"
          value={`${s.successRate}%`}
          note={`${s.activeUsers.toLocaleString()} active user${s.activeUsers === 1 ? "" : "s"} · ${s.messagesCount.toLocaleString()} messages`}
          icon={<CheckCircle2 />}
          tone={s.successRate >= 90 ? "success" : "danger"}
          hint="Percentage of executions delivered without error"
        />
        <StatCard
          label="Avg / P95 Latency"
          value={formatDuration(s.avgDurationMs)}
          note={`P50: ${formatDuration(s.p50DurationMs)} · P95: ${formatDuration(s.p95DurationMs)} · Max: ${formatDuration(s.maxDurationMs)}`}
          icon={<Gauge />}
          tone="info"
          hint="End-to-end execution duration from Telegram command to outbound reply"
        />
        <StatCard
          label="AI Tokens & Calls"
          value={s.totalTokens.toLocaleString()}
          note={`${s.aiCalls.toLocaleString()} model call${s.aiCalls === 1 ? "" : "s"} · ${formatCostUsd(s.aiCostUsd)} est.`}
          icon={<Cpu />}
          tone="cyan"
          hint={`${s.promptTokens.toLocaleString()} prompt + ${s.completionTokens.toLocaleString()} completion tokens`}
        />
      </section>

      {/* Mini metric strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel flex items-center gap-3 p-3">
          <MessageSquare className="size-4 shrink-0 text-lavender" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-muted">Messages Processed</p>
            <p className="text-sm font-bold tabular-nums">{s.messagesCount.toLocaleString()}</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-3">
          <Users className="size-4 shrink-0 text-sky" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-muted">Active Telegram Users</p>
            <p className="text-sm font-bold tabular-nums">{s.activeUsers.toLocaleString()}</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-3">
          <Clock className="size-4 shrink-0 text-ok" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-muted">Fastest Run</p>
            <p className="text-sm font-bold tabular-nums">{s.minDurationMs ? formatDuration(s.minDurationMs) : "-"}</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-3">
          <Coins className="size-4 shrink-0 text-accent" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] text-muted">Prompt / Completion</p>
            <p className="truncate text-sm font-bold tabular-nums">{s.promptTokens.toLocaleString()} / {s.completionTokens.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Executions Over Time" description={range === "all" ? "Daily command & message volume" : `Last ${range} days`} />
          <div className="px-3 pb-4"><TrendChart id="bot-exec-trend" label="Bot executions over time" data={data.trend} /></div>
        </Card>
        <Card>
          <CardHeader title="Daily Outcomes" description="Succeeded vs failed command executions per day" />
          <div className="px-3 pb-4"><StatusBars data={data.dailyStatus} /></div>
        </Card>
      </div>

      {/* Command Performance & AI Models */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Command & Trigger Performance"
            description="Volume, reliability, latency, and token usage per command. Click any row to filter executions."
          />
          <div className="overflow-x-auto px-5 pb-5">
            {data.byCommand.length === 0 ? (
              <p className="panel p-5 text-center text-sm text-muted">No command telemetry recorded in this time window.</p>
            ) : (
              <table className="rn-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Command</th>
                    <th>Volume</th>
                    <th className="text-right">Success</th>
                    <th className="text-right">Avg / P95</th>
                    <th className="text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCommand.map((c) => {
                    const activeRow = triggerFilter === c.trigger;
                    return (
                      <tr
                        key={c.trigger}
                        onClick={() => setTriggerFilter(activeRow ? "all" : c.trigger)}
                        className={cn("cursor-pointer", activeRow && "bg-primary/12")}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <code className="rounded-md border border-primary/35 bg-primary/12 px-2 py-0.5 text-xs font-bold text-lavender">{c.label}</code>
                            <span className="text-[11px] text-muted">{triggerCategoryLabel(c.category)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-foreground/10">
                              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.round((c.count / maxCmdCount) * 100)}%` }} />
                            </div>
                            <span className="text-xs font-bold tabular-nums">{c.count}</span>
                          </div>
                        </td>
                        <td className="text-right">
                          <Badge tone={c.successRate >= 95 ? "success" : c.successRate >= 80 ? "warning" : "danger"}>{c.successRate}%</Badge>
                        </td>
                        <td className="text-right text-xs tabular-nums">
                          <span className="font-semibold">{formatDuration(c.avgDurationMs)}</span>
                          <span className="ml-1 text-muted">/ {formatDuration(c.p95DurationMs)}</span>
                        </td>
                        <td className="text-right text-xs tabular-nums text-muted">
                          {c.totalTokens > 0 ? c.totalTokens.toLocaleString() : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="AI Models Invoked" description="Models called by this bot's commands and chats." />
          <div className="space-y-2.5 px-5 pb-5">
            {data.byModel.length === 0 ? (
              <p className="panel p-5 text-center text-sm text-muted">No AI model calls linked in this period.</p>
            ) : (
              data.byModel.map((m) => (
                <div key={`${m.slug}-${m.kind}`} className="panel space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold text-foreground">{m.slug}</p>
                      <p className="text-[11px] text-muted">{providerDisplayName(m.source)} &middot; <span className="uppercase">{m.kind}</span></p>
                    </div>
                    <Badge tone={m.source === "nvidia" ? "success" : "info"}>{formatCostUsd(m.costUsd)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-1.5 text-[11px] tabular-nums text-muted">
                    <span><strong className="text-foreground">{m.calls}</strong> call{m.calls === 1 ? "" : "s"}</span>
                    <span><strong className="text-foreground">{m.tokens.toLocaleString()}</strong> tokens</span>
                    <span>Avg <strong className="text-foreground">{formatDuration(m.avgLatencyMs)}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Detailed Interactive Executions Table */}
      <Card className="p-5">
        <CardHeader
          title="Bot Activity & Command Executions"
          description="Select any run to open the full command journey modal with timestamps, AI model calls, and Telegram delivery details."
          action={
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="tabular-nums font-semibold text-foreground/85">
                {filteredExecutions.length} of {executions.length} shown
              </span>
              {(search || statusFilter !== "all" || triggerFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setTriggerFilter("all"); }}
                  className="font-semibold text-lavender hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          }
        />
        <div className="space-y-4 px-5 pb-4 pt-1">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_150px_190px]">
            <Input
              aria-label="Search executions"
              icon={<Search />}
              placeholder="Search command, prompt, user, model, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "succeeded" | "failed")}>
              <option value="all">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </Select>
            <Select aria-label="Filter by command" value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)}>
              <option value="all">All commands &amp; triggers</option>
              {triggerOptions.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Select>
          </div>

          {filteredExecutions.length === 0 ? (
            <p className="panel p-6 text-center text-sm text-muted">
              {executions.length === 0
                ? `No executions recorded for this bot yet. Send a message or command to @${botUsername || "your bot"} on Telegram to test.`
                : "No executions match your current filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="rn-table min-w-[780px]">
                <thead>
                  <tr>
                    <th>Command / Trigger</th>
                    <th>User / Chat</th>
                    <th>Model &amp; Tokens</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Started</th>
                    <th className="text-right">Journey</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExecutions.map((ex) => {
                    const durPct = ex.durationMs ? Math.max(6, Math.round((ex.durationMs / maxDur) * 100)) : 0;
                    return (
                      <tr
                        key={ex.id}
                        onClick={() => setSelected(ex)}
                        className="group cursor-pointer"
                      >
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <code className="rounded-md border border-primary/35 bg-primary/12 px-2 py-0.5 text-xs font-bold text-lavender">
                              {ex.triggerLabel}
                            </code>
                            <span className="text-[11px] text-muted">{triggerCategoryLabel(ex.triggerCategory)}</span>
                          </div>
                          {ex.inputPreview && (
                            <p className="mt-1 max-w-[260px] truncate text-xs text-foreground/75" title={ex.inputPreview}>
                              {ex.inputPreview}
                            </p>
                          )}
                        </td>
                        <td className="text-xs">
                          <span className="font-medium text-foreground/90">{ex.actorLabel ?? "Telegram"}</span>
                          {ex.chatId && ex.actorLabel && !ex.actorLabel.startsWith("Chat ") && (
                            <span className="block font-mono text-[10px] text-muted">#{ex.chatId}</span>
                          )}
                        </td>
                        <td className="text-xs">
                          {ex.modelLabel ? (
                            <div>
                              <span className="block max-w-[180px] truncate font-mono text-[11px] font-semibold text-foreground/90" title={ex.modelLabel}>
                                {ex.modelLabel}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted">
                                <Hash className="size-2.5" />
                                {ex.totalTokens > 0 ? `${ex.totalTokens.toLocaleString()} tok` : "Media / 0 tok"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted">Direct / Built-in</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={ex.status === "succeeded" ? "success" : ex.status === "failed" ? "danger" : "neutral"} dot className="capitalize">
                            {ex.status}
                          </Badge>
                          {ex.errorCode && (
                            <span className="mt-0.5 block font-mono text-[10px] text-bad">{ex.errorCode}</span>
                          )}
                        </td>
                        <td className="tabular-nums">
                          <div className="text-xs font-semibold">{formatDuration(ex.durationMs)}</div>
                          {ex.durationMs !== null && (
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
                              <div
                                className={cn("h-full rounded-full", ex.status === "failed" ? "bg-danger" : "bg-gradient-to-r from-primary to-accent")}
                                style={{ width: `${durPct}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-xs tabular-nums text-muted">
                          {formatUserDateTime(ex.startedAt, prefs)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setSelected(ex); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-foreground/90 transition hover:border-lavender/60 hover:bg-primary/15 hover:text-lavender"
                          >
                            {ex.hasRecordedSteps ? <Route className="size-3.5 text-lavender" /> : <Eye className="size-3.5 text-lavender" />}
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {data.logs.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Recent Workspace Activity Logs" description="Audit entries from Supabase (activity_logs)." icon={<Activity />} />
          <ul className="space-y-2 p-5 pt-2">
            {data.logs.map((l) => (
              <li key={l.id} className="panel flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <div>
                  <span className="font-mono font-semibold text-foreground">{l.action}</span>
                  {l.detail && <span className="ml-2 text-muted">{l.detail}</span>}
                </div>
                <span className="text-muted tabular-nums">{formatUserDateTime(l.created_at, prefs)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ExecutionDetailModal
        executionId={selected?.id ?? null}
        initialSummary={selected}
        onClose={() => setSelected(null)}
        demo={demo}
      />
    </div>
  );
}
