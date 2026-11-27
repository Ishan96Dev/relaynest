"use client";

import { Bot, Eye, Hash, Route, Search, Zap } from "lucide-react";
import * as React from "react";
import {
  formatDuration,
  triggerCategoryLabel,
  type ExecutionSummaryItem,
} from "@backend/lib/execution-format";
import { formatUserDateTime } from "@backend/lib/preferences";
import { ExecutionDetailModal } from "@/components/analytics/execution-detail-modal";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export function ExecutionsTable({
  items,
  demo = false,
  compact = false,
}: {
  items: ExecutionSummaryItem[];
  demo?: boolean;
  compact?: boolean;
}) {
  const { prefs } = usePreferences();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "succeeded" | "failed">("all");
  const [botFilter, setBotFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<ExecutionSummaryItem | null>(null);

  const botNames = React.useMemo(() => [...new Set(items.map((i) => i.botName))].sort(), [items]);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (botFilter !== "all" && e.botName !== botFilter) return false;
      if (!q) return true;
      return (
        e.botName.toLowerCase().includes(q) ||
        e.triggerLabel.toLowerCase().includes(q) ||
        e.triggerType.toLowerCase().includes(q) ||
        (e.inputPreview ?? "").toLowerCase().includes(q) ||
        (e.actorLabel ?? "").toLowerCase().includes(q) ||
        (e.modelLabel ?? "").toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, botFilter]);

  const maxDur = Math.max(1, ...rows.map((r) => r.durationMs ?? 0));

  if (items.length === 0) {
    return (
      <EmptyState
        title="No executions yet"
        description="Executions appear as soon as a Telegram bot command, AI agent, or automation runs."
        icon={<Zap className="size-10" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn("grid grid-cols-1 gap-2.5", compact ? "sm:grid-cols-[1fr_150px]" : "sm:grid-cols-[1fr_160px_180px]")}>
        <Input
          aria-label="Search executions"
          icon={<Search />}
          placeholder="Search bot, command, prompt, model, or execution ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "succeeded" | "failed")}>
          <option value="all">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
        </Select>
        {!compact && (
          <Select aria-label="Filter by bot" value={botFilter} onChange={(e) => setBotFilter(e.target.value)}>
            <option value="all">All bots</option>
            {botNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="panel p-6 text-center text-sm text-muted">No executions match your filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="rn-table min-w-[780px]">
            <thead>
              <tr>
                <th>Bot</th>
                <th>Command / Trigger</th>
                <th>Model &amp; Tokens</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
                <th className="text-right">Journey</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const durPct = e.durationMs ? Math.max(6, Math.round((e.durationMs / maxDur) * 100)) : 0;
                return (
                  <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 shrink-0 text-lavender" aria-hidden />
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{e.botName}</span>
                          {e.actorLabel && <span className="block text-[11px] text-muted">{e.actorLabel}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <code className="rounded-md border border-primary/35 bg-primary/12 px-2 py-0.5 text-xs font-bold text-lavender">
                          {e.triggerLabel}
                        </code>
                        <span className="text-[11px] text-muted">{triggerCategoryLabel(e.triggerCategory)}</span>
                      </div>
                      {e.inputPreview && (
                        <p className="mt-1 max-w-[240px] truncate text-xs text-foreground/75" title={e.inputPreview}>
                          {e.inputPreview}
                        </p>
                      )}
                    </td>
                    <td className="text-xs">
                      {e.modelLabel ? (
                        <div>
                          <span className="block max-w-[175px] truncate font-mono text-[11px] font-semibold text-foreground/90" title={e.modelLabel}>
                            {e.modelLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted">
                            <Hash className="size-2.5" />
                            {e.totalTokens > 0 ? `${e.totalTokens.toLocaleString()} tok` : "0 tok"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">Direct / Built-in</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={e.status === "succeeded" ? "success" : e.status === "failed" ? "danger" : "neutral"} dot className="capitalize">
                        {e.status}
                      </Badge>
                      {e.errorCode && <span className="mt-0.5 block font-mono text-[10px] text-bad">{e.errorCode}</span>}
                    </td>
                    <td className="tabular-nums">
                      <div className="text-xs font-semibold">{formatDuration(e.durationMs)}</div>
                      {e.durationMs !== null && (
                        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className={cn("h-full rounded-full", e.status === "failed" ? "bg-danger" : "bg-gradient-to-r from-primary to-accent")}
                            style={{ width: `${durPct}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs tabular-nums text-muted">
                      {formatUserDateTime(e.startedAt, prefs)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-foreground/90 transition hover:border-lavender/60 hover:bg-primary/15 hover:text-lavender"
                      >
                        {e.hasRecordedSteps ? <Route className="size-3.5 text-lavender" /> : <Eye className="size-3.5 text-lavender" />}
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

      <ExecutionDetailModal
        executionId={selected?.id ?? null}
        initialSummary={selected}
        onClose={() => setSelected(null)}
        demo={demo}
      />
    </div>
  );
}
