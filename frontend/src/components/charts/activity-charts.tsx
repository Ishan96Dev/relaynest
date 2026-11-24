"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, chartTooltipStyle } from "./trend-chart";

export function ActivityBars({ data }: { data: { day: string; messages: number; executions: number }[] }) {
  return (
    <div style={{ height: 220 }} role="img" aria-label="Messages and executions per day" className="text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.08 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="messages" name="Messages" stackId="a" fill="#8B5CF6" animationDuration={800} />
          <Bar dataKey="executions" name="Executions" stackId="a" fill="#3B82F6" radius={[4, 4, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SuccessDonut({ success, failed }: { success: number; failed: number }) {
  const total = success + failed;
  const pct = total ? (success / total) * 100 : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${pct.toFixed(1)}% success rate`} className="shrink-0">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#EF4444" strokeWidth="14" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="#22C55E" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
        <text x="70" y="68" textAnchor="middle" className="fill-foreground text-xl font-bold">{pct.toFixed(1)}%</text>
        <text x="70" y="86" textAnchor="middle" className="fill-muted text-[10px]">Success Rate</text>
      </svg>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" aria-hidden />Successful <b>{success.toLocaleString()}</b></li>
        <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger" aria-hidden />Failed <b>{failed.toLocaleString()}</b></li>
      </ul>
    </div>
  );
}