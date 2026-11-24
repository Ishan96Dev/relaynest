"use client";

import {
  ArrowRight, Bell, Bot, Check, ChevronLeft, Download, Flame, Headphones, LayoutGrid, List, Paperclip, Search, Send, ShoppingCart,
  Sparkles, Star, Target, UserCog, Users, X, Zap, type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { Input, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";

import { demoTemplates, templateCategories } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import type { BotTemplate } from "@/types";
import { PageTitle } from "@/components/motion/split-text";

const catMeta: Record<string, { Icon: LucideIcon; tone: TileTone }> = {
  "Customer Support": { Icon: Headphones, tone: "info" },
  Community: { Icon: Users, tone: "primary" },
  Notifications: { Icon: Bell, tone: "amber" },
  "Marketing & Leads": { Icon: Target, tone: "pink" },
  Productivity: { Icon: Bot, tone: "info" },
  "E-commerce": { Icon: ShoppingCart, tone: "primary" },
};
const tplIcon = (t: BotTemplate) => catMeta[t.category] ?? { Icon: Bot, tone: "primary" as TileTone };

export function TemplatesBrowser() {
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<string>("");
  const [filter, setFilter] = React.useState("all");
  const [sort, setSort] = React.useState("popular");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [selected, setSelected] = React.useState<BotTemplate | null>(demoTemplates[0] ?? null);
  const [tab, setTab] = React.useState("overview");

  const list = React.useMemo(() => {
    const f = demoTemplates.filter(
      (t) => (!cat || t.category === cat) && (filter !== "popular" || t.popular) && (filter !== "easy" || t.difficulty === "Easy") &&
        (t.name + t.description).toLowerCase().includes(q.toLowerCase()),
    );
    return sort === "name" ? [...f].sort((a, b) => a.name.localeCompare(b.name)) : f;
  }, [q, cat, filter, sort]);

  const agentList = AGENT_TEMPLATES.filter((t) => (!cat || t.category === cat || (cat === "Customer Support" && t.category === "FAQ Assistant")) && (t.name + t.tagline).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid-cols-1 grid gap-6 xl:grid-cols-[minmax(0,1fr)_450px] 2xl:grid-cols-[minmax(0,1fr)_560px]">
      <div className="min-w-0 space-y-5">
        <div className="relative">
          <div className="max-w-xl">
            <h1 className="text-4xl font-extrabold tracking-tight"><PageTitle text="Explore Bot Templates" /></h1>
            <p className="mt-1 text-[15px] text-foreground/80">Start building faster with ready-to-use Telegram bot templates.</p>
          </div>
          <Image src="/images/illustrations/templates-plane.png" alt="" width={342} height={129} priority className="pointer-events-none absolute -top-3 right-0 hidden h-24 w-auto fade-edges lg:block light:hidden" />
        </div>

        <div className="grid-cols-1 grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input aria-label="Search templates" icon={<Search />} placeholder="Search templates (e.g. support bot, FAQ, notification...)" className="h-12" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="Category" className="h-12" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All Categories</option>
            {templateCategories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </div>

        <Tabs label="Template filters" value={filter} onChange={setFilter} className="w-fit"
          tabs={[
            { id: "all", label: "All Templates", icon: <LayoutGrid />, count: demoTemplates.length },
            { id: "popular", label: "Popular", icon: <Flame /> },
            { id: "recent", label: "Recently Added", icon: <Star /> },
            { id: "easy", label: "Beginner Friendly", icon: <Sparkles /> },
          ]} />

        <section aria-labelledby="by-cat">
          <div className="mb-3 flex items-center justify-between"><h2 id="by-cat" className="text-lg font-bold">Browse by Category</h2>
            <button className="text-sm font-semibold text-lavender hover:underline" onClick={() => setCat("")}>View All Categories <span aria-hidden>&rarr;</span></button></div>
          <ul className="grid-cols-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {templateCategories.map((c) => {
              const { Icon, tone } = catMeta[c] ?? { Icon: Bot, tone: "primary" as TileTone };
              return (
                <li key={c}>
                  <button aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}
                    className={cn("panel flex w-full flex-col items-center gap-2 px-2 py-3 text-xs font-semibold transition hover:border-lavender/60", cat === c && "border-lavender bg-primary/15")}>
                    <IconTile tone={tone} size="md"><Icon /></IconTile>{c}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">All Templates ({list.length})</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Sort by:</span>
            <Select aria-label="Sort templates" className="w-36" value={sort} onChange={(e) => setSort(e.target.value)}><option value="popular">Popular</option><option value="name">Name</option></Select>
            <div role="group" aria-label="View" className="flex rounded-lg border border-border p-0.5">
              {([["grid", LayoutGrid], ["list", List]] as const).map(([v, I]) => (
                <button key={v} aria-label={`${v} view`} aria-pressed={view === v} onClick={() => setView(v)} className={cn("grid size-8 place-items-center rounded-md", view === v ? "btn-primary-bg text-white" : "text-muted")}><I className="size-4" /></button>
              ))}
            </div>
          </div>
        </div>

        {list.length === 0 ? <p className="py-10 text-center text-sm text-muted">No templates match your search.</p> : (
          <ul className={cn("grid gap-4", view === "grid" ? "grid-cols-[repeat(auto-fill,minmax(290px,1fr))]" : "grid-cols-1")}>
            {list.map((t) => {
              const { Icon, tone } = tplIcon(t);
              return (
                <li key={t.id}>
                  <Card glow={selected?.id === t.id} hover className="flex h-full flex-col p-4">
                    <div className="flex items-start gap-3">
                      <IconTile tone={tone} size="lg"><Icon /></IconTile>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="font-bold leading-tight">{t.name}</h3>{t.popular && <Badge tone="warning" className="shrink-0"><Flame className="size-3" aria-hidden />Popular</Badge>}</div><p className="mt-1 text-[13px] text-foreground/75">{t.description}</p></div>
                    </div>
                    <div className="mt-3 flex gap-2"><Badge tone="primary">{t.category}</Badge><Badge tone="success"><Zap className="size-3" aria-hidden />{t.difficulty}</Badge></div>
                    <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-foreground/85">{t.features.slice(0, 3).map((f) => <li key={f} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-ok" aria-hidden />{f}</li>)}</ul>
                    <div className="grid-cols-1 mt-4 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setSelected(t); setTab("overview"); }}>Preview</Button>
                      <ButtonLink href={`/bots/new?template=${t.id}`} size="sm">Use Template <ArrowRight className="size-3.5" aria-hidden /></ButtonLink>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <section aria-labelledby="ai-tpl" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 id="ai-tpl" className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-4 text-lavender" aria-hidden />AI Agent Templates</h2><p className="text-sm text-muted">Pre-written instructions and messages for an AI-powered agent. You can edit everything.</p></div>
            <ButtonLink href="/bots/new?type=ai" variant="outline" size="sm">Import from file instead</ButtonLink>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
            {agentList.map((t) => (
              <li key={t.id}>
                <Card hover className="flex h-full flex-col p-4">
                  <div className="flex items-start gap-3">
                    <IconTile tone="primary" size="lg"><Bot /></IconTile>
                    <div className="min-w-0 flex-1"><h3 className="font-bold leading-tight">{t.name}</h3><p className="mt-1 text-[13px] text-foreground/75">{t.tagline}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><Badge tone="primary">{t.category}</Badge><Badge tone="info">AI Agent</Badge></div>
                  <div className="mt-auto pt-4"><ButtonLink href={`/bots/new?type=ai&template=${t.id}`} size="sm" className="w-full">Use Template <ArrowRight className="size-3.5" aria-hidden /></ButtonLink></div>
                </Card>
              </li>
            ))}
          </ul>
          {agentList.length === 0 && <p className="text-sm text-muted">No AI agent templates match this filter.</p>}
        </section>
      </div>

      {selected && <TemplateDetail t={selected} tab={tab} setTab={setTab} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TemplateDetail({ t, tab, setTab, onClose }: { t: BotTemplate; tab: string; setTab: (v: string) => void; onClose: () => void }) {
  const { Icon, tone } = tplIcon(t);
  const reqs = t.requirements ?? ["A Telegram Bot Token from @BotFather"];
  return (
    <aside aria-label="Template details" className="xl:sticky xl:top-24 xl:self-start">
      <Card glow className="p-5">
        <div className="flex items-start gap-4">
          <IconTile tone={tone} size="xl"><Icon /></IconTile>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="text-xl font-extrabold leading-tight">{t.name}</h2>{t.popular && <Badge tone="warning">Popular</Badge>}</div>
            <p className="mt-1 text-sm text-foreground/80">{t.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone="primary">{t.category}</Badge><Badge tone="success">{t.difficulty}</Badge><span className="flex items-center gap-1 text-xs text-foreground/80"><Download className="size-3.5" aria-hidden />{t.uses} Uses</span></div>
          </div>
          <button aria-label="Close preview" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-foreground/5"><X className="size-4" /></button>
        </div>

        <Tabs size="sm" className="mt-4" label="Template sections" value={tab} onChange={setTab} tabs={["overview", "features", "commands", "requirements", "preview"].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1) }))} />

        <div className="grid-cols-1 mt-4 grid gap-4 2xl:grid-cols-2">
          <div className="space-y-4">
            {(tab === "overview" || tab === "features") && (
              <section><h3 className="mb-2 flex items-center gap-2 font-bold"><Star className="size-4 text-lavender" aria-hidden />Key Features</h3>
                <ul className="space-y-1.5 text-[13px] text-foreground/85">{t.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{f}</li>)}</ul></section>
            )}
            {(tab === "overview" || tab === "commands") && (
              <section><h3 className="mb-2 flex items-center gap-2 font-bold"><Send className="size-4 text-lavender" aria-hidden />Example Commands</h3>
                <ul className="space-y-2">{t.commands.map((c) => <li key={c.command} className="flex items-center gap-2 text-[13px]"><code className="rounded-md bg-primary/25 px-2 py-0.5 font-semibold text-lavender">{c.command}</code><span className="text-foreground/75">{c.description}</span></li>)}</ul></section>
            )}
            {(tab === "overview" || tab === "requirements") && (
              <section><h3 className="mb-2 flex items-center gap-2 font-bold"><UserCog className="size-4 text-lavender" aria-hidden />Configuration Requirements</h3>
                <ul className="space-y-1.5 text-[13px] text-foreground/85">{reqs.map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-lavender" aria-hidden />{r}</li>)}</ul></section>
            )}
          </div>
          {(tab === "overview" || tab === "preview") && (
            <section aria-label="Chat preview" className="panel flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2"><ChevronLeft className="size-4 text-muted" aria-hidden /><Headphones className="size-4 text-lavender" aria-hidden /><div className="leading-tight"><p className="text-xs font-bold">{t.name.replace(" Bot", "Bot")}</p><p className="text-[10px] text-muted">bot</p></div></div>
              <div className="flex-1 space-y-2 p-3 text-[12px]">
                <p className="ml-auto w-fit rounded-xl rounded-br-sm bg-gradient-to-r from-info to-primary px-3 py-1.5 text-white">{t.commands[0]?.command ?? "/start"}</p>
                <p className="w-fit max-w-[92%] whitespace-pre-line rounded-xl rounded-bl-sm bg-surface px-3 py-2 text-foreground/90 ring-1 ring-border">{t.previewReply ?? `Hello! Welcome to ${t.name}.\n\nType /help to see what I can do.`}</p>
              </div>
              <div className="flex items-center gap-2 border-t border-border/70 px-3 py-2 text-muted"><Paperclip className="size-4" aria-hidden /><span className="flex-1 text-xs">Message...</span><span className="grid-cols-1 grid size-6 place-items-center rounded-full bg-info text-white" aria-hidden><Send className="size-3" /></span></div>
            </section>
          )}
        </div>

        <div className="grid-cols-1 mt-5 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" disabled title="Telegram preview is not available yet."><Send className="size-4" />Preview in Telegram</Button>
          <ButtonLink href={`/bots/new?template=${t.id}`}>Use This Template <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        </div>
      </Card>
    </aside>
  );
}
