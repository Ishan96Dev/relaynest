"use client";

import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import * as React from "react";
import {
  formatCompactVolume,
  formatMarketPrice,
  formatSignedChange,
  type AgenticStepEvent,
  type MarketQuote,
} from "@backend/server/ai/market-data-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Displays live autonomous tool execution steps (Market Feeds + Open Web Research)
 * and structured live NSE/BSE/MSE quote cards inside Playground and Telegram Preview.
 */
export function AgenticActivityPanel({
  steps = [],
  quotes = [],
  variant = "playground",
}: {
  steps?: AgenticStepEvent[];
  quotes?: MarketQuote[];
  variant?: "playground" | "telegram";
}) {
  const [open, setOpen] = React.useState(false);
  const running = steps.some((s) => s.status === "running");

  if (!steps.length && !quotes.length) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className={cn("mb-2.5 space-y-2", variant === "telegram" && "text-xs")}>
      {steps.length > 0 && (
        <div className="rounded-xl border border-border/75 bg-surface/75 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open || running}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-foreground/90"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {running ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-lavender" aria-hidden />
              ) : (
                <Activity className="size-3.5 shrink-0 text-ok" aria-hidden />
              )}
              <span className="truncate">
                {running
                  ? steps.find((s) => s.status === "running")?.label ?? "Running live agent tools..."
                  : `Agentic tools completed (${doneCount} ${doneCount === 1 ? "tool" : "tools"})`}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
              {quotes.length > 0 && (
                <Badge tone="success" className="px-1.5 py-0 text-[10px]">
                  {quotes.length} live {quotes.length === 1 ? "quote" : "quotes"}
                </Badge>
              )}
              {open || running ? (
                <ChevronDown className="size-3.5" aria-hidden />
              ) : (
                <ChevronRight className="size-3.5" aria-hidden />
              )}
            </span>
          </button>

          {(open || running) && (
            <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 text-[11.5px]">
                  <span className="flex min-w-0 items-start gap-1.5">
                    {s.status === "running" ? (
                      <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-lavender" aria-hidden />
                    ) : s.tool === "market_quotes" ? (
                      <TrendingUp className="mt-0.5 size-3 shrink-0 text-ok" aria-hidden />
                    ) : (
                      <Globe className="mt-0.5 size-3 shrink-0 text-sky" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="font-semibold text-foreground/90">{s.label}</span>
                      {s.detail && <span className="block truncate text-[11px] text-muted">{s.detail}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[10.5px] text-muted">
                    {s.status === "done" && s.durationMs !== undefined ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <CheckCircle2 className="size-3" aria-hidden />
                        {(s.durationMs / 1000).toFixed(1)}s
                      </span>
                    ) : s.status === "running" ? (
                      "Live..."
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {quotes.length > 0 && (
        <div
          className={cn(
            "grid gap-2",
            variant === "playground"
              ? quotes.length === 1
                ? "grid-cols-1 sm:max-w-sm"
                : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1",
          )}
          aria-label="Live market quotes"
        >
          {quotes.slice(0, 6).map((q) => {
            const up = (q.change ?? q.changePercent ?? 0) >= 0;
            return (
              <a
                key={`${q.ticker}:${q.exchange}`}
                href={q.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-border/80 bg-surface/90 p-2.5 transition hover:border-lavender/60 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-extrabold text-foreground">{q.symbol}</span>
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-bold text-lavender">
                        {q.exchange}
                      </span>
                    </div>
                    <p className="truncate text-[10.5px] text-muted">{q.name}</p>
                  </div>
                  <ExternalLink className="size-3 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden />
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-extrabold tabular-nums text-foreground">
                    {formatMarketPrice(q.price, q.currency)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums",
                      up ? "text-ok" : "text-bad",
                    )}
                  >
                    {up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                    {formatSignedChange(q.change, q.changePercent)}
                  </span>
                </div>

                {(q.dayLow !== null && q.dayHigh !== null) || q.volume !== null ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-1 text-[10px] text-muted tabular-nums">
                    {q.dayLow !== null && q.dayHigh !== null && (
                      <span>
                        Day: {formatMarketPrice(q.dayLow, q.currency)} – {formatMarketPrice(q.dayHigh, q.currency)}
                      </span>
                    )}
                    {q.volume !== null && <span>Vol {formatCompactVolume(q.volume)}</span>}
                  </div>
                ) : null}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
