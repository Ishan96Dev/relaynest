"use client";

import { AlertTriangle, Bot, Calendar, ChevronDown, Code2, Eye, Lightbulb, MessageSquare, MoreVertical, TrendingUp, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { ActivityBars, SuccessDonut } from "@/components/charts/lazy-charts";
import { TrendChart } from "@/components/charts/lazy-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Select } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/tooltip";
import { demoCommands, demoExecutions, demoMessages } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/motion/split-text";

const RANGES = [["24h", "Last 24 Hours"], ["7d", "Last 7 Days"], ["30d", "Last 30 Days"], ["custom", "Custom Range"]] as const;

/** Sample analytics (the mockup data). Real aggregation arrives with execution history. */
export function AnalyticsView() {
  const [range, setRange] = React.useState<(typeof RANGES)[number][0]>("7d");
  const users = demoMessages.map((m) => ({ day: m.day, value: Math.round(m.messages / 4) }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><TrendingUp /></IconTile>
          <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Analytics & Insights" /></h1><p className="mt-0.5 text-sm text-foreground/80">Track performance, usage, and automation insights for your Telegram bots.</p></div>
        </div>
        <Image src="/images/illustrations/analytics-graphic.png" alt="" width={213} height={88} className="pointer-events-none hidden h-20 w-auto fade-edges lg:block light:hidden" />
        <Badge tone="warning">Sample data</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Date range" className="flex gap-2">
          {RANGES.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={range === id} onClick={() => setRange(id)}
              className={cn("flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition", range === id ? "btn-primary-bg border-transparent text-white" : "border-border bg-surface-2/70 text-foreground/85 hover:border-lavender/60")}>
              {id === "custom" && <Calendar className="size-4" aria-hidden />}{label}{id === "custom" && <ChevronDown className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm"><label htmlFor="bot-select" className="text-foreground/80">Select Bot</label>
          <Select id="bot-select" className="w-52" defaultValue="SupportBot"><option>SupportBot</option><option>NotifyBot</option><option>CommunityBot</option></Select></div>
      </div>

      <section aria-label="Key metrics" className="grid-cols-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Messages" value="24,890" delta="+18.4%" note="vs previous 7 days" icon={<MessageSquare />} tone="primary" hint="Messages handled" />
        <StatCard label="Active Users" value="1,248" delta="+12.7%" note="vs previous 7 days" icon={<Users />} tone="info" subtle />
        <StatCard label="Commands Executed" value="5,420" delta="+21.3%" note="vs previous 7 days" icon={<Code2 />} tone="primary" subtle />
        <StatCard label="Automation Runs" value="3,860" delta="+15.9%" note="vs previous 7 days" icon={<Zap />} tone="primary" subtle />
        <StatCard label="Failed Executions" value="128" delta="+2.8%" note="vs previous 7 days" icon={<AlertTriangle />} tone="danger" subtle />
      </section>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1fr_1fr_330px]">
        <Card><CardHeader title="Messages Over Time" as="h3" action={<InfoTip content="Daily message volume" />} />
          <div className="px-3 pb-4"><TrendChart id="msg" label="Messages over time" data={demoMessages.map((m) => ({ day: m.day, value: m.messages }))} /></div></Card>
        <Card><CardHeader title="Bot Activity" as="h3" action={<InfoTip content="Messages and executions per day" />} />
          <div className="px-3 pb-4"><ActivityBars data={demoMessages} /></div></Card>
        <Card className="row-span-2 xl:row-span-2">
          <CardHeader title="Insights" icon={<Lightbulb />} tile />
          <ul className="space-y-4 p-5 pt-2">
            {[
              { t: "success", h: "Messages increased by 18.4%", d: "24,890 vs 21,023 (previous 7 days)" },
              { t: "success", h: "Active users grew by 12.7%", d: "1,248 vs 1,107 (previous 7 days)" },
              { t: "info", h: "Automation success rate: 96.7%", d: "3,732 successful out of 3,860 runs" },
              { t: "danger", h: "Failed executions: 128", d: "+2.8% increase (review recommended)" },
            ].map((i) => (
              <li key={i.h} className="flex items-start gap-3">
                <IconTile size="sm" tone={i.t === "danger" ? "danger" : i.t === "info" ? "info" : "success"}>{i.t === "danger" ? <AlertTriangle /> : i.t === "info" ? <Zap /> : <TrendingUp />}</IconTile>
                <div className="leading-snug"><p className="text-sm font-bold">{i.h}</p><p className="text-xs text-foreground/75">{i.d}</p></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <div className="grid-cols-1 grid gap-5 lg:grid-cols-3">
            <div><CardHeader title="Most-Used Commands" as="h3" />
              <ul className="space-y-3 px-5 pb-5">
                {demoCommands.map((c) => (
                  <li key={c.command} className="grid-cols-1 grid grid-cols-[56px_1fr_96px] items-center gap-2 text-sm">
                    <code className="text-foreground/90">{c.command}</code>
                    <div className="h-2.5 rounded-full bg-foreground/10" role="img" aria-label={`${c.pct}%`}><div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.min(100, c.pct * 2.6)}%` }} /></div>
                    <span className="text-right text-xs text-foreground/80">{c.count.toLocaleString()} ({c.pct}%)</span>
                  </li>
                ))}
              </ul></div>
            <div><CardHeader title="Execution Success vs Failure" as="h3" /><div className="px-5 pb-5"><SuccessDonut success={3732} failed={128} /></div></div>
            <div><CardHeader title="User Activity" as="h3" /><div className="px-2 pb-4"><TrendChart id="usr" label="User activity" color="#22D3EE" height={170} data={users} /></div></div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Executions" as="h3" action={<Link href="/executions" className="text-sm font-semibold text-lavender hover:underline">View All Executions <span aria-hidden>&rarr;</span></Link>} />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="rn-table min-w-[760px]">
            <thead><tr><th>Execution ID</th><th>Bot Name</th><th>Trigger</th><th>Status</th><th>Execution Time</th><th>Timestamp</th><th className="text-center">Actions</th></tr></thead>
            <tbody>
              {demoExecutions.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.id}</td>
                  <td><span className="flex items-center gap-2 font-semibold"><Bot className="size-4 text-info" aria-hidden />{e.botName}</span></td>
                  <td className="text-foreground/85">{e.trigger}</td>
                  <td><Badge tone={e.status === "succeeded" ? "success" : "danger"} dot>{e.status === "succeeded" ? "Success" : "Failed"}</Badge></td>
                  <td className="tabular-nums">{(e.durationMs / 1000).toFixed(2)} s</td>
                  <td className="text-foreground/85">{e.startedAt}</td>
                  <td><div className="flex items-center justify-center gap-1"><Link href="/executions" aria-label={`View ${e.id}`} className="grid-cols-1 grid size-8 place-items-center rounded-md text-foreground/85 hover:bg-foreground/5"><Eye className="size-4" /></Link><MoreVertical className="size-4 text-muted" aria-hidden /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
