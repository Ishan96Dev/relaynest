"use client";

import {
  Accessibility, Calendar, Clock, Code2, Eye, Globe, Grid3x3, Home, Keyboard, LayoutDashboard, Loader2, Palette, Play, RotateCcw, Save, ScanSearch,
  Bot, SlidersHorizontal, Table2, ShieldCheck, History, BarChart3, Layers, CheckCircle2, type LucideIcon,
} from "lucide-react";
import * as React from "react";
import {
  BOT_VIEW_CHOICES,
  DATE_FORMAT_CHOICES,
  FIRST_DAY_CHOICES,
  LANDING_CHOICES,
  LANGUAGE_CHOICES,
  TIME_FORMAT_CHOICES,
  TIMEZONE_CHOICES,
  formatUserDate,
  formatUserDateTime,
  formatUserNumber,
  formatUserTime,
  orderedWeekdays,
  type ThemeChoice,
  type UserPreferences,
} from "@backend/lib/preferences";
import { PageTitle } from "@/components/motion/split-text";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Select } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function Row({ icon: I, label, desc, children, stack }: { icon: LucideIcon; label: string; desc?: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={cn("grid items-center gap-3 border-b border-border/50 py-2.5 last:border-0", stack ? "" : "sm:grid-cols-[200px_1fr]")}>
      <div className="flex items-center gap-3">
        <I className="size-5 shrink-0 text-lavender" aria-hidden />
        <div className="leading-tight">
          <p className="text-sm font-semibold">{label}</p>
          {desc && <p className="text-[11px] text-foreground/70">{desc}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Pick({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <><label htmlFor={id} className="sr-only">{label}</label>{children}</>;
}

const themes: { id: ThemeChoice; label: string; desc: string }[] = [
  { id: "dark", label: "Dark", desc: "A modern dark experience with reduced eye strain." },
  { id: "light", label: "Light", desc: "A clean and bright interface." },
  { id: "system", label: "System Default", desc: "Automatically match your system theme." },
];

export function PreferenceSettings() {
  const { prefs, updatedAt, saving, savePreferences, resetPreferences, previewDomFlags } = usePreferences();
  const [draft, setDraft] = React.useState<UserPreferences>(prefs);
  const [resetting, setResetting] = React.useState(false);

  // Sync draft when committed prefs change externally (e.g. Header theme toggle or reset).
  React.useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  // Restore committed DOM flags if the user navigates away with unsaved preview changes.
  const committedRef = React.useRef(prefs);
  committedRef.current = prefs;
  React.useEffect(() => () => { previewDomFlags(committedRef.current); }, [previewDomFlags]);

  const dirty = React.useMemo(
    () => (Object.keys(prefs) as Array<keyof UserPreferences>).some((k) => draft[k] !== prefs[k]),
    [draft, prefs],
  );

  const upd = (patch: Partial<UserPreferences>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    previewDomFlags(next);
  };

  async function handleSave() {
    const res = await savePreferences(draft);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setDraft(res.preferences);
    toast.success("Preferences saved to your account");
  }

  async function handleReset() {
    setResetting(true);
    const res = await resetPreferences();
    setResetting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setDraft(res.preferences);
    toast.success("Preferences reset to defaults");
  }

  const now = new Date();
  const preview = {
    date: formatUserDate(now, draft),
    time: formatUserTime(now, draft),
    number: formatUserNumber(123456.78, draft),
    week: orderedWeekdays(draft.firstDay).slice(0, 3).join(" · "),
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><Palette /></IconTile>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Preferences" /></h1>
            <p className="text-sm text-foreground/80">Customize your RelayNest application experience. Synced to your account in Supabase.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Badge tone="warning" dot>Unsaved changes</Badge>
          ) : updatedAt ? (
            <Badge tone="success" className="gap-1.5">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Synced {formatUserDateTime(updatedAt, prefs)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader title="Appearance" description="Choose how RelayNest looks and feels across all devices." icon={<Palette />} tile />
          <div role="radiogroup" aria-label="Theme" className="grid-cols-1 grid gap-3 px-5 pb-5 sm:grid-cols-3">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={draft.theme === t.id}
                onClick={() => upd({ theme: t.id })}
                className={cn(
                  "rounded-2xl border p-3 text-left transition",
                  draft.theme === t.id
                    ? "border-lavender bg-primary/15 shadow-[0_0_24px_-10px_rgb(var(--rn-primary))]"
                    : "border-border bg-surface-2/50 hover:border-lavender/50",
                )}
              >
                <span className={cn("mb-3 block h-24 rounded-xl border border-border/60 p-2", t.id === "light" ? "bg-white" : t.id === "system" ? "bg-gradient-to-br from-white from-50% to-[#141232] to-50%" : "bg-[#0F0E28]")} aria-hidden>
                  <span className="mb-1.5 block h-2 w-10 rounded bg-primary/70" />
                  <span className={cn("block h-2 w-16 rounded", t.id === "light" ? "bg-zinc-200" : "bg-white/15")} />
                  <span className={cn("mt-1.5 block h-8 rounded", t.id === "light" ? "bg-zinc-100" : "bg-white/10")} />
                </span>
                <span className="flex items-start gap-2">
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", draft.theme === t.id ? "border-lavender" : "border-muted")}>
                    {draft.theme === t.id && <span className="size-2 rounded-full bg-lavender" />}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-bold">{t.label}</span>
                    <span className="text-[11px] text-foreground/70">{t.desc}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Language" description="Set your preferred language and regional format." icon={<Globe />} tile />
          <div className="grid-cols-1 grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_1fr]">
            <div className="self-center">
              <Pick id="lang" label="Language">
                <Select id="lang" value={draft.language} onChange={(e) => upd({ language: e.target.value as UserPreferences["language"] })}>
                  {LANGUAGE_CHOICES.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Pick>
              <p className="mt-2 text-[11px] text-muted">Controls regional date, time &amp; number formatting across the workspace.</p>
            </div>
            <div className="border-border sm:border-l sm:pl-5">
              <p className="mb-2 text-sm font-bold">Regional Format <span className="font-normal text-muted">(Live Preview)</span></p>
              <dl className="space-y-1.5 text-sm text-foreground/85">
                <div className="flex items-center gap-2"><Calendar className="size-4 text-lavender" aria-hidden /><dt>Date:</dt><dd className="font-medium tabular-nums">{preview.date}</dd></div>
                <div className="flex items-center gap-2"><Clock className="size-4 text-lavender" aria-hidden /><dt>Time:</dt><dd className="font-medium tabular-nums">{preview.time}</dd></div>
                <div className="flex items-center gap-2"><span className="grid-cols-1 grid size-4 place-items-center rounded border border-lavender/60 text-[8px] text-lavender" aria-hidden>123</span><dt>Number:</dt><dd className="font-medium tabular-nums">{preview.number}</dd></div>
                <div className="flex items-center gap-2"><Calendar className="size-4 text-lavender" aria-hidden /><dt>Week:</dt><dd className="text-xs font-medium text-muted">{preview.week}…</dd></div>
              </dl>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Date & Time" description="Configure timezone and date/time formats used across logs, bots, and schedules." icon={<Calendar />} tile />
          <div className="px-5 pb-4">
            <Row icon={Globe} label="Timezone">
              <Pick id="tz" label="Timezone">
                <Select id="tz" value={draft.timezone} onChange={(e) => upd({ timezone: e.target.value as UserPreferences["timezone"] })}>
                  {TIMEZONE_CHOICES.map((z) => <option key={z} value={z}>{z}</option>)}
                </Select>
              </Pick>
            </Row>
            <Row icon={Calendar} label="Date Format">
              <Pick id="df" label="Date format">
                <Select id="df" value={draft.dateFormat} onChange={(e) => upd({ dateFormat: e.target.value as UserPreferences["dateFormat"] })}>
                  {DATE_FORMAT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              </Pick>
            </Row>
            <Row icon={Clock} label="Time Format">
              <Pick id="tf" label="Time format">
                <Select id="tf" value={draft.timeFormat} onChange={(e) => upd({ timeFormat: e.target.value as UserPreferences["timeFormat"] })}>
                  {TIME_FORMAT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              </Pick>
            </Row>
            <Row icon={Calendar} label="First Day of Week">
              <Pick id="fd" label="First day of week">
                <Select id="fd" value={draft.firstDay} onChange={(e) => upd({ firstDay: e.target.value as UserPreferences["firstDay"] })}>
                  {FIRST_DAY_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              </Pick>
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Dashboard Preferences" description="Customize your dashboard, landing page, bot filters, and table spacing." icon={<LayoutDashboard />} tile />
          <div className="px-5 pb-4">
            <Row icon={Home} label="Default Landing Page">
              <Pick id="lp" label="Default landing page">
                <Select id="lp" value={draft.landing} onChange={(e) => upd({ landing: e.target.value as UserPreferences["landing"] })}>
                  {LANDING_CHOICES.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Pick>
            </Row>
            <Row icon={LayoutDashboard} label="Dashboard Layout">
              <Segmented
                label="Dashboard layout"
                value={draft.layout}
                onChange={(v) => upd({ layout: v as UserPreferences["layout"] })}
                options={[{ id: "auto", label: "Auto" }, { id: "grid", label: "Grid" }, { id: "compact", label: "Compact" }]}
              />
            </Row>
            <Row icon={Bot} label="Default Bot View">
              <Pick id="bv" label="Default bot view">
                <Select id="bv" value={draft.botView} onChange={(e) => upd({ botView: e.target.value as UserPreferences["botView"] })}>
                  {BOT_VIEW_CHOICES.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Pick>
            </Row>
            <Row icon={Table2} label="Table Density">
              <Segmented
                label="Table density"
                value={draft.density}
                onChange={(v) => upd({ density: v as UserPreferences["density"] })}
                options={[{ id: "comfortable", label: "Comfortable" }, { id: "standard", label: "Standard" }, { id: "compact", label: "Compact" }]}
              />
            </Row>
            <Row icon={BarChart3} label="Show Dashboard Statistics" desc="Display key metrics (bots, executions, usage) on the dashboard." stack>
              <div className="flex justify-end">
                <Switch label="Show dashboard statistics" checked={draft.showStats} onCheckedChange={(v) => upd({ showStats: v })} />
              </div>
            </Row>
          </div>
        </Card>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Editor Preferences" description="Configure your workflow editor canvas, auto-save, and publishing guard." icon={<Code2 />} tile />
          <div className="px-5 pb-4">
            <Row icon={ScanSearch} label="Default Canvas Zoom">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  aria-label="Default canvas zoom"
                  min={50}
                  max={150}
                  step={10}
                  value={draft.zoom}
                  onChange={(e) => upd({ zoom: Number(e.target.value) })}
                  className="flex-1 accent-[rgb(var(--rn-primary))]"
                />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{draft.zoom}%</span>
              </div>
            </Row>
            {(
              [
                ["grid", Grid3x3, "Grid Visibility", "Show grid on the workflow canvas."],
                ["autosave", History, "Auto-save", "Automatically save workflow drafts while you work."],
                ["confirmPublish", ShieldCheck, "Confirmation Before Publishing", "Show a confirmation dialog before publishing a workflow."],
              ] as const
            ).map(([k, I, l, d]) => (
              <Row key={k} icon={I} label={l} desc={d} stack>
                <div className="flex justify-end">
                  <Switch label={l} checked={Boolean(draft[k])} onCheckedChange={(v) => upd({ [k]: v })} />
                </div>
              </Row>
            ))}
            <Row icon={Layers} label="Workflow Editor Theme">
              <Segmented
                label="Workflow editor theme"
                value={draft.editorTheme}
                onChange={(v) => upd({ editorTheme: v as UserPreferences["editorTheme"] })}
                options={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }, { id: "contrast", label: "High Contrast" }]}
              />
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Accessibility" description="Make RelayNest more accessible and comfortable to use." icon={<Accessibility />} tile />
          <ul className="px-5 pb-4">
            {(
              [
                ["reduceMotion", Play, "Reduced Motion", "Minimize animations and motion effects across the app."],
                ["highContrast", Eye, "High Contrast", "Increase contrast for better readability."],
                ["compact", SlidersHorizontal, "Compact Interface", "Use a more condensed layout to fit more content on screen."],
                ["keyHints", Keyboard, "Keyboard Navigation Hints", "Show helpful shortcuts and key hints in the interface."],
              ] as const
            ).map(([k, I, l, d]) => (
              <li key={k} className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
                <I className="size-5 shrink-0 text-lavender" aria-hidden />
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-semibold">{l}</p>
                  <p className="text-[11px] text-foreground/70">{d}</p>
                </div>
                <Switch label={l} checked={Boolean(draft[k])} onCheckedChange={(v) => upd({ [k]: v })} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button size="lg" onClick={handleSave} disabled={saving || resetting}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
        <Button size="lg" variant="outline" onClick={handleReset} disabled={saving || resetting}>
          {resetting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
          {resetting ? "Resetting..." : "Reset to Defaults"}
        </Button>
      </div>
    </div>
  );
}
