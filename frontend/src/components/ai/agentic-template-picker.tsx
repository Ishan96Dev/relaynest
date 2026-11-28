"use client";

import {
  ArrowRight,
  Bot,
  CalendarClock,
  Globe,
  Play,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agent-templates";
import { cn } from "@/lib/utils";

/**
 * Full searchable gallery of ALL Agentic AI & Classic AI Agent Templates right inside Model Playground.
 * Applying any template configures its system prompt, live search/market tools, model, and starter test prompts.
 */
export function AgenticTemplateModal({
  open,
  onClose,
  activeTemplateId,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  activeTemplateId: string | null;
  onApply: (tpl: AgentTemplate) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "agentic" | "classic">("all");
  const [category, setCategory] = React.useState("All");
  const [selectedId, setSelectedId] = React.useState<string>(() => activeTemplateId ?? AGENT_TEMPLATES[0]?.id ?? "");

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory("All");
    setSelectedId(activeTemplateId ?? AGENT_TEMPLATES[0]?.id ?? "");
  }, [open, activeTemplateId]);

  const scoped = React.useMemo(() => {
    if (scope === "agentic") return AGENT_TEMPLATES.filter((t) => Boolean(t.isAgentic));
    if (scope === "classic") return AGENT_TEMPLATES.filter((t) => !t.isAgentic);
    return AGENT_TEMPLATES;
  }, [scope]);

  const categories = React.useMemo(
    () => ["All", ...Array.from(new Set(scoped.map((t) => t.category)))],
    [scoped],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.tagline} ${t.category} ${(t.badges ?? []).join(" ")} ${(t.commands ?? []).map((c) => c.command).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scoped, category, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agentic & AI Agent Templates — Test in Playground"
      icon={<Sparkles className="mt-1 size-5 text-lavender" aria-hidden />}
      className="max-w-5xl p-4 sm:p-5 md:h-[min(88dvh,780px)]"
      bodyClassName="mt-2.5 flex flex-col md:overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="min-w-[240px] flex-1 text-xs leading-relaxed text-muted">
            Test any Telegram AI Agent template live in Playground with autonomous web search, NSE/BSE/MSE market feeds, slash commands &amp; starter prompts — then deploy to Telegram in 1 click.
          </p>
          <div className="flex shrink-0 rounded-lg border border-border bg-surface-2/60 p-0.5 text-[11px] font-semibold">
            {(
              [
                ["all", `All (${AGENT_TEMPLATES.length})`],
                ["agentic", `Agentic Live (${AGENT_TEMPLATES.filter((t) => t.isAgentic).length})`],
                ["classic", `Classic (${AGENT_TEMPLATES.filter((t) => !t.isAgentic).length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setScope(k); setCategory("All"); }}
                className={cn(
                  "rounded-md px-2.5 py-1 transition",
                  scope === k ? "btn-primary-bg text-white" : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Input
            aria-label="Search agent templates"
            icon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NSE, BSE, MSE, broker, land, student, exam, cricket, gaming, mandi, tax..."
          />
          <div
            className="flex gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible md:pb-0"
            role="tablist"
            aria-label="Agent template categories"
          >
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
                  category === c
                    ? "border-lavender bg-primary/20 text-foreground"
                    : "border-border bg-surface-2/60 text-muted hover:border-lavender/50 hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,285px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
          <ul
            className="max-h-56 space-y-1.5 overflow-y-auto pr-1 md:h-full md:max-h-none md:min-h-0"
            aria-label="Agentic templates"
          >
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-border bg-surface-2/50 p-4 text-center text-xs text-muted">
                No templates match &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((t) => {
                const isSel = selected?.id === t.id;
                const isActive = activeTemplateId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-xl border p-2.5 text-left transition",
                        isSel
                          ? "border-lavender bg-primary/15 shadow-[0_0_20px_-10px_rgb(var(--rn-primary))]"
                          : "border-border bg-surface-2/50 hover:border-lavender/50 hover:bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-xs font-bold text-foreground">{t.name}</span>
                        {isActive && <Badge tone="success" className="px-1.5 py-0 text-[10px]">Loaded</Badge>}
                      </div>
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted">{t.tagline}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-lavender">
                          {t.category}
                        </span>
                        {t.tools?.marketData && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                            <TrendingUp className="size-2.5" aria-hidden />Market Feed
                          </span>
                        )}
                        {t.tools?.autoSearch && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky">
                            <Globe className="size-2.5" aria-hidden />Auto Search
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2/60 p-3.5 sm:p-4 md:h-full">
            {selected ? (
              <>
                <div className="shrink-0 border-b border-border/70 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bot className="size-4 text-lavender" aria-hidden />
                    <h3 className="text-sm font-extrabold text-foreground">{selected.name}</h3>
                    {selected.isAgentic && <Badge tone="info" className="text-[10px]">Agentic Live AI</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{selected.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="primary" className="text-[10px]">{selected.category}</Badge>
                    {selected.tools?.marketData && (
                      <Badge tone="success" className="text-[10px]">
                        <TrendingUp className="size-3" aria-hidden />Live NSE / BSE / MSE Feed
                      </Badge>
                    )}
                    {selected.tools?.autoSearch && (
                      <Badge tone="info" className="text-[10px]">
                        <Globe className="size-3" aria-hidden />Autonomous Web Search
                      </Badge>
                    )}
                    {selected.dailyBriefing && (
                      <Badge tone="warning" className="text-[10px]">
                        <CalendarClock className="size-3" aria-hidden />{selected.dailyBriefing.scheduleLabel}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-xs">
                  {selected.commands && selected.commands.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-bold text-foreground/85">Slash Commands (work in Playground &amp; Telegram)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.commands.map((c) => (
                          <span key={c.command} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/80 px-2 py-1 text-[11px]">
                            <code className="font-bold text-lavender">/{c.command}</code>
                            <span className="text-muted">{c.description}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selected.starterPrompts && selected.starterPrompts.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-bold text-foreground/85">Included Starter Test Prompts</p>
                      <ul className="space-y-1">
                        {selected.starterPrompts.map((sp) => (
                          <li key={sp.label} className="rounded-lg border border-border/70 bg-surface/70 px-2.5 py-1.5 text-[11.5px]">
                            <span className="font-semibold text-foreground">{sp.label}:</span>{" "}
                            <span className="text-muted">{sp.prompt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 font-bold text-foreground/85">Agent Instructions</p>
                    <pre className="whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/85">
                      {selected.instructions}
                    </pre>
                  </div>
                </div>

                <div className="mt-2.5 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
                  <ButtonLink href={`/bots/new?type=ai&template=${selected.id}`} variant="outline" size="sm">
                    Deploy to Telegram <ArrowRight className="size-3.5" aria-hidden />
                  </ButtonLink>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onApply(selected);
                      onClose();
                    }}
                  >
                    <Play className="size-3.5" aria-hidden />
                    Load &amp; Test in Playground
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center py-10 text-xs text-muted">
                Select a template on the left to inspect it.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
