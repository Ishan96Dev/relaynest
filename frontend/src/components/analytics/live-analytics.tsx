"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, CheckCircle2, Gauge, Layers, XCircle } from "lucide-react";
import Link from "next/link";
import type { AnalyticsData } from "@backend/server/services/workspace-data";
import { SuccessDonut, TrendChart } from "@/components/charts/lazy-charts";
import { axisTick, chartTooltipStyle } from "@/components/charts/trend-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/tooltip";

function StatusBars({ data }: { data: { day: string; succeeded: number; failed: number }[] }) {
  return (
    <div style={{ height: 220 }} role="img" aria-label="Succeeded and failed runs per day" className="text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.08 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="succeeded" name="Succeeded" stackId="s" fill="#22C55E" />
          <Bar dataKey="failed" name="Failed" stackId="s" fill="#EF4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LiveAnalytics({ a }: { a: AnalyticsData }) {
  const rate = a.total ? Math.round((a.succeeded / a.total) * 100) : 0;
  const maxTrig = Math.max(1, ...a.byTrigger.map((t) => t.count));

  return (
    <div className="space-y-6">
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Executions" value={a.total.toLocaleString()} icon={<Layers />} tone="primary" hint={`Bot and automation runs in the last ${a.days} days`} />
        <StatCard label="Success Rate" value={`${rate}%`} icon={<CheckCircle2 />} tone="success" hint="Share of runs that finished without an error" />
        <StatCard label="Failed Runs" value={a.failed.toLocaleString()} icon={<XCircle />} tone="danger" hint="Runs that ended with an error" />
        <StatCard label="Avg / P95 Latency" value={`${a.avgDurationMs.toLocaleString()} ms`} note={`P95: ${a.p95DurationMs.toLocaleString()} ms`} icon={<Gauge />} tone="info" hint="Average and 95th percentile run duration" />
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
          <CardHeader title="Top Triggers & Commands" description="Most active triggers" />
          <ul className="space-y-2.5 px-5 pb-5">
            {a.byTrigger.length === 0 ? <li className="text-sm text-muted">No triggers recorded yet.</li> : a.byTrigger.map((t) => (
              <li key={t.trigger} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-xs">
                <code className="truncate text-foreground/90">{t.trigger}</code>
                <div className="h-2 rounded-full bg-foreground/10"><div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.round((t.count / maxTrig) * 100)}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{t.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="By Bot" description="Volume & reliability per bot" />
          <ul className="space-y-2.5 px-5 pb-5">
            {a.byBot.length === 0 ? <li className="text-sm text-muted">No bot activity yet.</li> : a.byBot.map((b) => (
              <li key={b.botName} className="panel flex items-center justify-between gap-2 p-2.5 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-semibold"><Bot className="size-3.5 shrink-0 text-lavender" /> <span className="truncate">{b.botName}</span></span>
                <span className="shrink-0 tabular-nums text-muted">{b.succeeded} ok / {b.failed} err</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Executions" action={<Link href="/executions" className="text-sm font-semibold text-lavender hover:underline">View All &rarr;</Link>} />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="rn-table min-w-[640px]">
            <thead><tr><th>Bot</th><th>Trigger</th><th>Status</th><th>Duration</th><th>Started</th></tr></thead>
            <tbody>
              {a.recent.map((e) => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.botName}</td>
                  <td><code className="text-xs">{e.trigger}</code></td>
                  <td><Badge tone={e.status === "succeeded" ? "success" : e.status === "failed" ? "danger" : "neutral"} className="capitalize">{e.status}</Badge></td>
                  <td className="tabular-nums">{e.durationMs !== null ? `${e.durationMs} ms` : "-"}</td>
                  <td className="text-xs text-muted">{new Date(e.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
