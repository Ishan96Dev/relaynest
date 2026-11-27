"use client";

import { Bot, CheckCircle2, Gauge, Layers, Users, XCircle } from "lucide-react";
import Link from "next/link";
import { formatDuration, triggerCategoryLabel } from "@backend/lib/execution-format";
import type { AnalyticsData } from "@backend/server/services/workspace-data";
import { ExecutionsTable } from "@/components/analytics/executions-table";
import { StatusBars, SuccessDonut, TrendChart } from "@/components/charts/lazy-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/tooltip";

export function LiveAnalytics({ a }: { a: AnalyticsData }) {
  const rate = a.total ? Math.round((a.succeeded / a.total) * 100) : 0;
  const maxTrig = Math.max(1, ...a.byTrigger.map((t) => t.count));

  return (
    <div className="space-y-6">
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Executions"
          value={a.total.toLocaleString()}
          note={`${a.commandRuns.toLocaleString()} bot · ${a.workflowRuns.toLocaleString()} workflow`}
          icon={<Layers />}
          tone="primary"
          hint={`Bot and automation runs in the last ${a.days} days`}
        />
        <StatCard
          label="Active Users"
          value={a.activeUsers.toLocaleString()}
          note="Unique Telegram chats & users"
          icon={<Users />}
          tone="cyan"
          hint="Distinct Telegram users interacting with your workspace bots"
        />
        <StatCard
          label="Success Rate"
          value={`${rate}%`}
          note={`${a.succeeded.toLocaleString()} succeeded`}
          icon={<CheckCircle2 />}
          tone="success"
          hint="Share of runs that finished without an error"
        />
        <StatCard
          label="Failed Runs"
          value={a.failed.toLocaleString()}
          note={a.failed === 0 ? "Healthy · 0 errors" : "Click failed runs below to inspect"}
          icon={<XCircle />}
          tone="danger"
          hint="Runs that ended with an error"
        />
        <StatCard
          label="Avg / P95 Latency"
          value={formatDuration(a.avgDurationMs)}
          note={`P50: ${formatDuration(a.p50DurationMs)} · P95: ${formatDuration(a.p95DurationMs)}`}
          icon={<Gauge />}
          tone="info"
          hint={`Min: ${formatDuration(a.minDurationMs)} · Max: ${formatDuration(a.maxDurationMs)}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Executions Over Time" description={`Last ${a.days} days`} action={<InfoTip content="Total bot and workflow runs per day" />} />
          <div className="px-3 pb-4"><TrendChart data={a.trend} /></div>
        </Card>
        <Card>
          <CardHeader title="Daily Outcomes" description="Succeeded vs failed per day" action={<InfoTip content="Daily breakdown of successful vs failed runs" />} />
          <div className="px-3 pb-4"><StatusBars data={a.dailyStatus} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Success vs Failure" description="Overall run reliability" />
          <div className="px-5 pb-5"><SuccessDonut success={a.succeeded} failed={a.failed} /></div>
        </Card>

        <Card>
          <CardHeader title="Top Triggers & Commands" description="Volume, reliability & avg latency" />
          <ul className="space-y-3 px-5 pb-5">
            {a.byTrigger.length === 0 ? <li className="text-sm text-muted">No triggers recorded yet.</li> : a.byTrigger.map((t) => (
              <li key={t.trigger} className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <code className="truncate rounded border border-primary/35 bg-primary/12 px-1.5 py-0.5 font-bold text-lavender">{t.label}</code>
                    <span className="truncate text-[10px] text-muted">{triggerCategoryLabel(t.category)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-muted">{formatDuration(t.avgDurationMs)}</span>
                    <Badge tone={t.successRate >= 95 ? "success" : t.successRate >= 80 ? "warning" : "danger"}>{t.successRate}%</Badge>
                    <span className="font-bold text-foreground">{t.count}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.round((t.count / maxTrig) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="By Bot" description="Volume, latency, users & reliability" />
          <ul className="space-y-2.5 px-5 pb-5">
            {a.byBot.length === 0 ? <li className="text-sm text-muted">No bot activity yet.</li> : a.byBot.map((b) => {
              const inner = (
                <>
                  <div className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <Bot className="size-3.5 shrink-0 text-lavender" />
                      <span className="truncate">{b.botName}</span>
                    </span>
                    <span className="block text-[10px] text-muted">
                      Avg {formatDuration(b.avgDurationMs)} · {b.activeUsers} user{b.activeUsers === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted">
                    <strong className="text-ok">{b.succeeded}</strong> ok / <strong className={b.failed ? "text-bad" : ""}>{b.failed}</strong> err
                  </span>
                </>
              );
              return (
                <li key={b.botId ?? b.botName}>
                  {b.botId ? (
                    <Link href={`/bots/${b.botId}`} className="panel flex items-center justify-between gap-2 p-2.5 text-xs transition hover:border-lavender/60">
                      {inner}
                    </Link>
                  ) : (
                    <div className="panel flex items-center justify-between gap-2 p-2.5 text-xs">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent Command & Workflow Executions"
          description="Click any row to inspect its complete step-by-step journey modal (Command → Model → Telegram Output)."
          action={<Link href="/executions" className="text-sm font-semibold text-lavender hover:underline">View All &rarr;</Link>}
        />
        <div className="px-5 pb-5">
          <ExecutionsTable items={a.recent} compact />
        </div>
      </Card>
    </div>
  );
}
