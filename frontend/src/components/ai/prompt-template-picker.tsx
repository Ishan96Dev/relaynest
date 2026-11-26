"use client";
import { BrainCircuit, Check, Copy, LayoutTemplate, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { copyToClipboard } from "@/components/ai/copy-bubble-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  getPromptTemplates,
  type PromptTemplateScope,
  type SystemPromptTemplate,
} from "@/lib/prompt-templates";
import { cn } from "@/lib/utils";

/**
 * Searchable, category-filtered System Prompt Template browser modal shared by
 * Model Playground (`scope="playground"`) and Telegram AI Agents (`scope="telegram"`).
 */
export function PromptTemplateModal({
  open,
  onClose,
  scope,
  activePrompt,
  preferredCategory,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  scope: PromptTemplateScope;
  activePrompt?: string;
  preferredCategory?: string;
  onApply: (template: SystemPromptTemplate) => void;
}) {
  const templates = React.useMemo(() => getPromptTemplates(scope), [scope]);
  const categories = React.useMemo(
    () => ["All", ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [selectedId, setSelectedId] = React.useState<string>(() => templates[0]?.id ?? "");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    if (preferredCategory && categories.includes(preferredCategory)) {
      setCategory(preferredCategory);
      const firstInCat = templates.find((t) => t.category === preferredCategory);
      if (firstInCat) setSelectedId(firstInCat.id);
    } else {
      setCategory("All");
      const matched = activePrompt
        ? templates.find((t) => t.prompt.trim() === activePrompt.trim())
        : undefined;
      setSelectedId(matched?.id ?? templates[0]?.id ?? "");
    }
  }, [open, preferredCategory, categories, templates, activePrompt]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.tagline} ${t.category} ${t.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [templates, category, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  async function handleCopy(tpl: SystemPromptTemplate) {
    const ok = await copyToClipboard(tpl.prompt);
    if (!ok) return;
    setCopiedId(tpl.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === tpl.id ? null : cur)), 1800);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scope === "playground" ? "Playground System Prompt Templates" : "Telegram AI Agent System Prompt Templates"}
      icon={<LayoutTemplate className="mt-1 size-5 text-lavender" aria-hidden />}
      className="max-w-4xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {scope === "playground"
            ? "Production-tested system prompts structured with Role, Rules, Constraints, and Output Format. Apply one and customize freely."
            : "Mobile-first Telegram agent prompts built for scannable replies, Knowledge Base grounding, safe boundaries, and human escalation."}
        </p>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              aria-label="Search prompt templates"
              icon={<Search />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={scope === "playground" ? "Search coding, research, SQL, copywriting, JSON..." : "Search support, sales, FAQ, community, booking..."}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Template categories">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
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

        <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Available templates">
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-border bg-surface-2/50 p-4 text-center text-xs text-muted">
                No templates match &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((t) => {
                const isSel = selected?.id === t.id;
                const isActive = activePrompt?.trim() === t.prompt.trim();
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-foreground">{t.name}</span>
                        {isActive && <Badge tone="success" className="px-1.5 py-0 text-[10px]">Active</Badge>}
                      </div>
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted">{t.tagline}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-lavender">
                          {t.category}
                        </span>
                        {t.recommendThinking && scope === "playground" && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky">
                            <BrainCircuit className="size-2.5" aria-hidden />Deep Think
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex min-h-[280px] flex-col rounded-xl border border-border bg-surface-2/60 p-3.5">
            {selected ? (
              <>
                <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-2.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground">{selected.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">{selected.tagline}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="primary" className="text-[10px]">{selected.category}</Badge>
                      {selected.recommendedTemperature !== undefined && (
                        <Badge tone="neutral" className="text-[10px]">
                          Suggested temp: {selected.recommendedTemperature.toFixed(2)}
                        </Badge>
                      )}
                      {selected.recommendThinking && scope === "playground" && (
                        <Badge tone="info" className="text-[10px]">
                          <BrainCircuit className="size-3" aria-hidden />Pairs well with Deep Thinking
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <pre className="max-h-[30vh] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/80 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                  {selected.prompt}
                </pre>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {selected.prompt.length.toLocaleString("en-US")} chars
                    {scope === "telegram" ? " • Replace {{Placeholders}} with your details" : ""}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy(selected)}>
                      {copiedId === selected.id ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {copiedId === selected.id ? "Copied" : "Copy prompt"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onApply(selected);
                        onClose();
                      }}
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      Use template
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-xs text-muted">
                Select a template on the left to preview it.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
