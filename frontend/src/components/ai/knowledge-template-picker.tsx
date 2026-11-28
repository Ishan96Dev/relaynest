"use client";
import { BookOpen, Check, Copy, FileText, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { copyToClipboard } from "@/components/ai/copy-bubble-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  KNOWLEDGE_SOURCE_TEMPLATES,
  type KnowledgeSourceTemplate,
} from "@/lib/knowledge-templates";
import { cn } from "@/lib/utils";

const KNOWLEDGE_BUDGET_CHARS = 24_000;

/**
 * Searchable, category-filtered Knowledge Source Template browser modal for AI Agents.
 * Mirrors PromptTemplateModal so users can preview, copy, or load structured Markdown
 * reference sources directly into the agent's Knowledge sources form.
 */
export function KnowledgeTemplateModal({
  open,
  onClose,
  preferredCategory,
  activeTitle,
  activeContent,
  existingTitles = [],
  usedChars = 0,
  canApply = true,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  preferredCategory?: string;
  activeTitle?: string;
  activeContent?: string;
  existingTitles?: string[];
  usedChars?: number;
  canApply?: boolean;
  onApply: (template: KnowledgeSourceTemplate) => void;
}) {
  const templates = KNOWLEDGE_SOURCE_TEMPLATES;
  const categories = React.useMemo(
    () => ["All", ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );
  const existingSet = React.useMemo(
    () => new Set(existingTitles.map((t) => t.trim().toLowerCase())),
    [existingTitles],
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
      const matched = activeTitle && activeContent
        ? templates.find(
            (t) =>
              t.title.trim() === activeTitle.trim() &&
              t.content.trim() === activeContent.trim(),
          )
        : undefined;
      setSelectedId(matched?.id ?? templates[0]?.id ?? "");
    }
  }, [open, preferredCategory, categories, templates, activeTitle, activeContent]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.title} ${t.tagline} ${t.category} ${t.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [templates, category, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;
  const wouldExceedBudget = selected ? usedChars + selected.content.length > KNOWLEDGE_BUDGET_CHARS : false;

  async function handleCopy(tpl: KnowledgeSourceTemplate) {
    const ok = await copyToClipboard(tpl.content);
    if (!ok) return;
    setCopiedId(tpl.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === tpl.id ? null : cur)), 1800);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Knowledge Source Templates"
      icon={<BookOpen className="mt-1 size-5 text-lavender" aria-hidden />}
      className="max-w-4xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Ready-to-customize Markdown reference sources formatted for accurate Telegram answers and inline citations. Load one into the editor, replace {"{{Placeholders}}"}, and click Add source.
        </p>

        <div className="flex flex-col gap-2.5">
          <Input
            aria-label="Search knowledge templates"
            icon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search refund policy, shipping, pricing, FAQ, rules, API..."
          />
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Knowledge template categories">
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
          <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Available knowledge templates">
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-border bg-surface-2/50 p-4 text-center text-xs text-muted">
                No templates match &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((t) => {
                const isSel = selected?.id === t.id;
                const isAdded = existingSet.has(t.title.trim().toLowerCase());
                const isDraft =
                  !isAdded &&
                  activeTitle?.trim() === t.title.trim() &&
                  activeContent?.trim() === t.content.trim();
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
                        {isAdded ? (
                          <Badge tone="success" className="px-1.5 py-0 text-[10px]">Added</Badge>
                        ) : isDraft ? (
                          <Badge tone="info" className="px-1.5 py-0 text-[10px]">In editor</Badge>
                        ) : null}
                      </div>
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted">{t.tagline}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-lavender">
                          {t.category}
                        </span>
                        <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {t.content.length.toLocaleString("en-US")} chars
                        </span>
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
                      <Badge tone="neutral" className="text-[10px]">
                        {selected.content.length.toLocaleString("en-US")} chars
                      </Badge>
                      {existingSet.has(selected.title.trim().toLowerCase()) && (
                        <Badge tone="success" className="text-[10px]">Already added</Badge>
                      )}
                      {wouldExceedBudget && (
                        <Badge tone="warning" className="text-[10px]">
                          Exceeds 24,000-char inline budget
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/70 bg-surface/60 px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 shrink-0 text-lavender" aria-hidden />
                  <span className="text-muted">Source title:</span>
                  <span className="truncate font-semibold text-foreground">{selected.title}</span>
                </div>
                <pre className="max-h-[30vh] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/80 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                  {selected.content}
                </pre>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {selected.content.length.toLocaleString("en-US")} chars &bull; Replace {"{{Placeholders}}"} with your details
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy(selected)}>
                      {copiedId === selected.id ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {copiedId === selected.id ? "Copied" : "Copy text"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canApply}
                      title={canApply ? undefined : "Save your agent first to load a template into the editor."}
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
