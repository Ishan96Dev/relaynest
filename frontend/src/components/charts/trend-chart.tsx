"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const chartTooltipStyle = {
  background: "rgb(var(--rn-surface))",
  border: "1px solid rgb(var(--rn-lavender) / 0.4)",
  borderRadius: 10,
  fontSize: 12,
  color: "rgb(var(--rn-text))",
  boxShadow: "0 12px 30px -12px rgb(var(--rn-shadow) / 0.8)",
};
export const axisTick = { fill: "currentColor", fontSize: 11 };

/** Axis text uses currentColor (text-muted), so the chart follows the active theme. */
export function TrendChart({
  data, dataKey = "value", height = 220, color = "#8B5CF6", id = "trend", label = "Trend chart",
}: { data: Record<string, string | number>[]; dataKey?: string; height?: number; color?: string; id?: string; label?: string }) {
  return (
    <div style={{ height }} role="img" aria-label={label} className="text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: color, strokeOpacity: 0.4 }} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${id})`} dot={{ r: 3.5, fill: "#fff", stroke: color, strokeWidth: 2 }} activeDot={{ r: 5.5 }} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}