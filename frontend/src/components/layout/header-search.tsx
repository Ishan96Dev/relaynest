"use client";

import { BookOpen, CornerDownLeft, FileQuestion, History, LifeBuoy, Plus, Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { usePreferences } from "@/components/providers/preferences-provider";
import { cn } from "@/lib/utils";
import { aiNav, mainNav, settingsNav } from "./nav";

interface Entry { label: string; href: string; icon: LucideIcon; group: string; hint: string; keywords: string }

/** Every page a member can open, with extra keywords so "telegram", "password" or "invoice" find the right one. */
const KEYWORDS: Record<string, string> = {
  "/dashboard": "home overview summary stats", "/bots": "bots telegram list", "/bots/templates": "templates faq support starter",
  "/agents": "automations workflows agents", "/knowledge-base": "knowledge docs files rag", "/analytics": "analytics charts usage metrics",
  "/integrations": "integrations telegram connect webhook", "/settings/profile": "profile name avatar email account",
  "/settings/workspace": "workspace team members", "/settings/security": "security password 2fa sessions",
  "/settings/notifications": "notifications alerts email", "/settings/api-keys": "api keys token developer",
  "/settings/billing": "billing plan subscription invoice payment upgrade pro", "/settings/preferences": "preferences theme language dark light",
  "/ai": "ai agents bots assistants", "/ai/models": "ai models llm catalog nvidia gemma embeddings providers", "/ai/playground": "playground models try prompt chat",
};

const ENTRIES: Entry[] = [
  ...mainNav.filter((i) => i.label !== "Settings").map((i) => ({ label: i.label, href: i.href, icon: i.icon, group: "Pages", hint: "Dashboard", keywords: KEYWORDS[i.href] ?? "" })),
  { label: "Create New Bot", href: "/bots/new", icon: Plus, group: "Pages", hint: "My Bots", keywords: "new bot create add connect token botfather" },
  { label: "Execution History", href: "/executions", icon: History, group: "Pages", hint: "Automations", keywords: "executions runs logs history" },
  ...aiNav.map((i) => ({ label: i.label, href: i.href, icon: i.icon, group: "Pages", hint: "AI Platform", keywords: KEYWORDS[i.href] ?? "" })),
  ...settingsNav.filter((i) => i.href !== "/integrations").map((i) => ({ label: i.label, href: i.href, icon: i.icon, group: "Settings", hint: i.description, keywords: KEYWORDS[i.href] ?? "" })),
  { label: "Documentation", href: "/docs", icon: BookOpen, group: "Help", hint: "Guides and API reference", keywords: "docs help guide" },
  { label: "Support", href: "/contact", icon: LifeBuoy, group: "Help", hint: "Contact the team", keywords: "support contact help" },
];

const QUICK = ["/dashboard", "/bots", "/bots/new", "/bots/templates", "/agents", "/settings/profile"];

function score(e: Entry, q: string): number {
  const label = e.label.toLowerCase();
  const hay = `${label} ${e.keywords} ${e.group.toLowerCase()} ${e.hint.toLowerCase()}`;
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return -1;
  if (!words.every((w) => hay.includes(w))) return -1;
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/\s+/).some((w) => w.startsWith(words[0]!))) return 60;
  if (label.includes(q)) return 40;
  return 10;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-primary/25 px-px text-lavender">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function HeaderSearch() {
  const { prefs } = usePreferences();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [value, setValue] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const q = value.trim().toLowerCase();

  const results = React.useMemo(() => {
    if (!q) return QUICK.map((h) => ENTRIES.find((e) => e.href === h)!).filter(Boolean);
    return ENTRIES.map((e) => ({ e, s: score(e, q) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.e).slice(0, 8);
  }, [q]);

  React.useEffect(() => setActive(0), [q]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); } };
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);
  React.useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (e: Entry) => { setOpen(false); setValue(""); inputRef.current?.blur(); router.push(e.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (results.length ? (a + 1) % results.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0)); }
    else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } else inputRef.current?.blur(); }
  };

  let lastGroup = "";
  return (
    <div ref={wrapRef} className="relative mx-auto hidden w-full max-w-[440px] sm:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef} type="text" role="combobox" aria-label="Search" aria-expanded={open} aria-controls="header-search-list" aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `hs-${active}` : undefined} autoComplete="off" spellCheck={false}
        placeholder="Search bots, automations, templates..." value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border border-border bg-surface-2/80 pl-10 pr-16 text-sm text-foreground placeholder:text-muted transition hover:border-lavender/40 focus:border-lavender focus:outline-none focus:ring-2 focus:ring-primary/30" />
      {prefs.keyHints && (
        <kbd className="rn-key-hint pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted">Ctrl K</kbd>
      )}

      {open && (
        <div className="card pop-in absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden p-1.5 shadow-2xl">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-sm text-muted">
              <FileQuestion className="size-6 opacity-70" aria-hidden />
              <p className="font-semibold text-foreground">No pages found</p>
              <p className="text-xs">Nothing matches &ldquo;{value.trim()}&rdquo;. Try &ldquo;bots&rdquo; or &ldquo;billing&rdquo;.</p>
            </div>
          ) : (
            <ul ref={listRef} id="header-search-list" role="listbox" aria-label="Pages" className="max-h-[340px] overflow-y-auto">
              {results.map((e, i) => {
                const group = q ? e.group : "Quick links";
                const heading = group !== lastGroup ? group : null;
                lastGroup = group;
                const Icon = e.icon;
                return (
                  <React.Fragment key={e.href}>
                    {heading && <li role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{heading}</li>}
                    <li role="option" id={`hs-${i}`} data-i={i} aria-selected={i === active}
                      onMouseMove={() => setActive(i)} onMouseDown={(ev) => ev.preventDefault()} onClick={() => go(e)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors", i === active ? "bg-primary/15" : "")}>
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border transition-colors", i === active ? "border-primary/50 bg-primary/20 text-lavender" : "border-border bg-surface-2 text-muted")}><Icon className="size-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-medium"><Highlight text={e.label} q={q} /></span>
                        <span className="block truncate text-xs text-muted">{e.hint}</span>
                      </span>
                      {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-lavender" aria-hidden />}
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          )}
          {prefs.keyHints && (
            <div className="rn-key-hint mt-1 flex items-center gap-3 border-t border-border/70 px-2.5 pb-1 pt-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↑</kbd><kbd className="rounded border border-border px-1">↓</kbd>navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↵</kbd>open</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">esc</kbd>close</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
