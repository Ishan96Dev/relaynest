"use client";
import dynamic from "next/dynamic";
import type * as Charts from "./activity-charts";
import type * as Trend from "./trend-chart";

/**
 * recharts is ~100 kB gzipped. These wrappers load it after the page is interactive, so pages that show a chart
 * paint their text, cards and navigation first instead of waiting for the chart library.
 */
function placeholder(height: number) {
  return function ChartPlaceholder() { return <div style={{ height }} className="animate-pulse rounded-xl bg-foreground/5" aria-hidden />; };
}

export const TrendChart = dynamic<React.ComponentProps<typeof Trend.TrendChart>>(
  () => import("./trend-chart").then((m) => m.TrendChart), { ssr: false, loading: placeholder(220) });
export const ActivityBars = dynamic<React.ComponentProps<typeof Charts.ActivityBars>>(
  () => import("./activity-charts").then((m) => m.ActivityBars), { ssr: false, loading: placeholder(220) });
export const SuccessDonut = dynamic<React.ComponentProps<typeof Charts.SuccessDonut>>(
  () => import("./activity-charts").then((m) => m.SuccessDonut), { ssr: false, loading: placeholder(220) });
