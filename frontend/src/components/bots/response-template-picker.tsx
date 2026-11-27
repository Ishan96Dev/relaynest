"use client";
import { Check, Copy, LayoutTemplate, MessageSquare, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { copyToClipboard } from "@/components/ai/copy-bubble-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  getQuickResponseTemplates,
  getResponseTemplateMatch,
  getResponseTemplates,
  matchesResponseCategory,
  resolveResponseText,
  type ResponseTemplate,
  type ResponseTemplateScope,
} from "@/lib/response-templates";
import { cn } from "@/lib/utils";

export interface ResponseTemplatePatch {
  welcomeMessage?: string;
  fallbackMessage?: string;
}

/**
 * Searchable, category-filtered Automatic Response Template browser modal shared by
 * Standard Bot create/edit (`scope="standard"`) and AI Agent create/edit (`scope="ai-agent"`).
 * Allows applying both Welcome + Fallback together or applying either message individually.
 */
export function ResponseTemplateModal({
  open,
  onClose,
  scope,
  botName,
  activeWelcome,
  activeFallback,
  preferredCategory,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  scope: ResponseTemplateScope;
  botName?: string;
  activeWelcome?: string;
  activeFallback?: string;
  preferredCategory?: string;
  onApply: (patch: ResponseTemplatePatch, template: ResponseTemplate) => void;
}) {
  const templates = React.useMemo(() => getResponseTemplates(scope), [scope]);
  const categories = React.useMemo(
    () => ["All", ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [selectedId, setSelectedId] = React.useState<string>(() => templates[0]?.id ?? "");
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const copyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const activeMatched = templates.find(
      (t) => getResponseTemplateMatch(t, activeWelcome, activeFallback, botName) !== null,
    );
    if (activeMatched) {
      setCategory("All");
      setSelectedId(activeMatched.id);
      return;
    }
    const matchedCategory = preferredCategory
      ? categories.find((c) => c !== "All" && matchesResponseCategory(c, preferredCategory))
      : undefined;
    if (matchedCategory) {
      setCategory(matchedCategory);
      const firstInCat = templates.find((t) => t.category === matchedCategory);
      if (firstInCat) setSelectedId(firstInCat.id);
    } else {
      setCategory("All");
      setSelectedId(templates[0]?.id ?? "");
    }
  }, [open, preferredCategory, categories, templates, activeWelcome, activeFallback, botName]);

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
  const resolvedWelcome = selected ? resolveResponseText(selected.welcomeMessage, botName) : "";
  const resolvedFallback = selected ? resolveResponseText(selected.fallbackMessage, botName) : "";
  const hasPlaceholders = /\{\{[^}]+\}\}/.test(`${resolvedWelcome}\n${resolvedFallback}`);
  const cleanBotName = botName?.trim();

  async function handleCopy(key: string, text: string) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedKey(key);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1800);
  }

  function applySelected(mode: "both" | "welcome" | "fallback") {
    if (!selected) return;
    const patch: ResponseTemplatePatch =
      mode === "welcome"
        ? { welcomeMessage: resolvedWelcome }
        : mode === "fallback"
          ? { fallbackMessage: resolvedFallback }
          : { welcomeMessage: resolvedWelcome, fallbackMessage: resolvedFallback };
    onApply(patch, selected);
    onClose();
  }

  const welcomeLabel = scope === "standard" ? "Welcome Message (/start fallback)" : "Welcome Message (/start)";
  const fallbackLabel = scope === "standard" ? "Default Fallback Response" : "Fallback Message (when model cannot answer)";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scope === "standard" ? "Automatic Response Templates" : "AI Agent Welcome & Fallback Templates"}
      icon={<LayoutTemplate className="mt-1 size-5 text-lavender" aria-hidden />}
      className="max-w-4xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {scope === "standard"
            ? "Ready-to-use Telegram welcome and fallback replies formatted cleanly for mobile screens. Apply both together or pick just one."
            : "Natural welcome greetings and calm outage fallback messages crafted for AI-powered Telegram agents."}
        </p>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              aria-label="Search response templates"
              icon={<Search />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                scope === "standard"
                  ? "Search support, FAQ, community, store, booking, alerts..."
                  : "Search support, FAQ, sales, community, tutor, studio..."
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Response template categories">
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
          <ul className="max-h-[48vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Available response templates">
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-border bg-surface-2/50 p-4 text-center text-xs text-muted">
                No templates match &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((t) => {
                const isSel = selected?.id === t.id;
                const match = getResponseTemplateMatch(t, activeWelcome, activeFallback, botName);
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
                        {match === "both" && (
                          <Badge tone="success" className="px-1.5 py-0 text-[10px]">
                            Active
                          </Badge>
                        )}
                        {(match === "welcome" || match === "fallback") && (
                          <Badge tone="info" className="px-1.5 py-0 text-[10px]">
                            {match === "welcome" ? "Welcome" : "Fallback"}
                          </Badge>
                        )}
                      </div>
                      <span className="line-clamp-2 text-[11px] leading-snug text-muted">{t.tagline}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-lavender">
                          {t.category}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex min-h-[300px] flex-col rounded-xl border border-border bg-surface-2/60 p-3.5">
            {selected ? (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-2.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground">{selected.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">{selected.tagline}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="primary" className="text-[10px]">
                        {selected.category}
                      </Badge>
                      {cleanBotName && selected.welcomeMessage.includes("{{BotName}}") && (
                        <Badge tone="neutral" className="text-[10px]">
                          Personalized for {cleanBotName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-[34vh] flex-1 space-y-3 overflow-y-auto pr-0.5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <MessageSquare className="size-3.5 text-lavender" aria-hidden />
                        {welcomeLabel}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted">{resolvedWelcome.length} chars</span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(`${selected.id}:w`, resolvedWelcome)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/80 px-2 py-0.5 text-[11px] font-semibold text-muted transition hover:border-lavender/50 hover:text-foreground"
                        >
                          {copiedKey === `${selected.id}:w` ? (
                            <Check className="size-3 text-ok" aria-hidden />
                          ) : (
                            <Copy className="size-3" aria-hidden />
                          )}
                          {copiedKey === `${selected.id}:w` ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => applySelected("welcome")}
                          className="inline-flex items-center gap-1 rounded-md border border-lavender/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-lavender transition hover:border-lavender hover:bg-primary/25"
                        >
                          Use welcome
                        </button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/80 p-3 font-sans text-xs leading-relaxed text-foreground/90">
                      {resolvedWelcome}
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <MessageSquare className="size-3.5 text-lavender" aria-hidden />
                        {fallbackLabel}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted">{resolvedFallback.length} chars</span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(`${selected.id}:f`, resolvedFallback)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/80 px-2 py-0.5 text-[11px] font-semibold text-muted transition hover:border-lavender/50 hover:text-foreground"
                        >
                          {copiedKey === `${selected.id}:f` ? (
                            <Check className="size-3 text-ok" aria-hidden />
                          ) : (
                            <Copy className="size-3" aria-hidden />
                          )}
                          {copiedKey === `${selected.id}:f` ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => applySelected("fallback")}
                          className="inline-flex items-center gap-1 rounded-md border border-lavender/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-lavender transition hover:border-lavender hover:bg-primary/25"
                        >
                          Use fallback
                        </button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/80 p-3 font-sans text-xs leading-relaxed text-foreground/90">
                      {resolvedFallback}
                    </pre>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <span className="text-[11px] text-muted">
                    {hasPlaceholders
                      ? "Customize any {{Placeholders}} after applying."
                      : "You can edit both messages freely after applying."}
                  </span>
                  <Button type="button" size="sm" onClick={() => applySelected("both")}>
                    <Sparkles className="size-3.5" aria-hidden />
                    Use both templates
                  </Button>
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

/**
 * Compact inline quick-apply strip of category-prioritized response templates
 * paired with a trigger to open the full searchable ResponseTemplateModal.
 */
export function ResponseTemplateQuickBar({
  scope,
  botName,
  activeWelcome,
  activeFallback,
  preferredCategory,
  onApply,
  onOpenModal,
  className,
}: {
  scope: ResponseTemplateScope;
  botName?: string;
  activeWelcome?: string;
  activeFallback?: string;
  preferredCategory?: string;
  onApply: (patch: ResponseTemplatePatch, template: ResponseTemplate) => void;
  onOpenModal: () => void;
  className?: string;
}) {
  const all = React.useMemo(() => getResponseTemplates(scope), [scope]);
  const quick = React.useMemo(
    () => getQuickResponseTemplates(scope, preferredCategory, 4),
    [scope, preferredCategory],
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Quick response templates"
    >
      <span className="text-xs font-semibold text-muted">Quick templates:</span>
      {quick.map((tpl) => {
        const match = getResponseTemplateMatch(tpl, activeWelcome, activeFallback, botName);
        return (
          <Button
            key={tpl.id}
            type="button"
            variant={match === "both" ? "subtle" : "outline"}
            size="sm"
            title={tpl.tagline}
            onClick={() =>
              onApply(
                {
                  welcomeMessage: resolveResponseText(tpl.welcomeMessage, botName),
                  fallbackMessage: resolveResponseText(tpl.fallbackMessage, botName),
                },
                tpl,
              )
            }
          >
            Use: {tpl.name}
          </Button>
        );
      })}
      <button
        type="button"
        onClick={onOpenModal}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-lavender/45 px-2.5 text-xs font-semibold text-lavender transition hover:border-lavender hover:bg-primary/10"
      >
        <LayoutTemplate className="size-3.5" aria-hidden />
        All {all.length}...
      </button>
    </div>
  );
}
