"use client";

import {
  Accessibility, Calendar, Clock, Code2, Eye, Globe, Grid3x3, Home, Keyboard, LayoutDashboard, Palette, Play, RotateCcw, Save, ScanSearch,
  Bot, SlidersHorizontal, Table2, ShieldCheck, History, BarChart3, Layers, type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Select } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/switch";
import { applyTheme, readTheme, type ThemeChoice } from "@/lib/theme";
import { useSyncedSetting } from "@/lib/use-synced-setting";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/motion/split-text";

const defaults = {
  language: "English", timezone: "Asia/Kolkata", dateFormat: "MMM DD, YYYY", timeFormat: "12-hour", firstDay: "Monday",
  landing: "Dashboard", layout: "auto", botView: "All Bots", density: "comfortable", showStats: true,
  zoom: 100, grid: true, autosave: true, confirmPublish: true, editorTheme: "dark",
  reduceMotion: false, highContrast: false, compact: false, keyHints: true,
};
type State = typeof defaults;

function Row({ icon: I, label, desc, children, stack }: { icon: LucideIcon; label: string; desc?: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={cn("grid items-center gap-3 border-b border-border/50 py-2.5 last:border-0", stack ? "" : "sm:grid-cols-[200px_1fr]")}>
      <div className="flex items-center gap-3"><I className="size-5 shrink-0 text-lavender" aria-hidden /><div className="leading-tight"><p className="text-sm font-semibold">{label}</p>{desc && <p className="text-[11px] text-foreground/70">{desc}</p>}</div></div>
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
  const { value, setValue, save, loaded, error, defaults: d0 } = useSyncedSetting<State>("preferences", defaults);
  React.useEffect(() => { if (error) toast.error(error); }, [error]);
  const [theme, setTheme] = React.useState<ThemeChoice>("dark");
  React.useEffect(() => setTheme(readTheme()), []);
  const upd = (p: Partial<State>) => { setValue({ ...value, ...p }); };
  const applyFlags = (v: State) => {
    const cls = document.documentElement.classList;
    cls.toggle("reduce-motion", v.reduceMotion);
    cls.toggle("high-contrast", v.highContrast);
  };
  if (!loaded) return null;

  const now = new Date();
  const preview = {
    date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: value.timezone }),
    time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: value.timeFormat === "12-hour", timeZone: value.timezone }),
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><Palette /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Preferences" /></h1><p className="text-sm text-foreground/80">Customize your RelayNest application experience. Synced to your account.</p></div></div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader title="Appearance" description="Choose how RelayNest looks and feels." icon={<Palette />} tile />
          <div role="radiogroup" aria-label="Theme" className="grid-cols-1 grid gap-3 px-5 pb-5 sm:grid-cols-3">
            {themes.map((t) => (
              <button key={t.id} role="radio" aria-checked={theme === t.id} onClick={() => { setTheme(t.id); applyTheme(t.id); }}
                className={cn("rounded-2xl border p-3 text-left transition", theme === t.id ? "border-lavender bg-primary/15 shadow-[0_0_24px_-10px_rgb(var(--rn-primary))]" : "border-border bg-surface-2/50 hover:border-lavender/50")}>
                <span className={cn("mb-3 block h-24 rounded-xl border border-border/60 p-2", t.id === "light" ? "bg-white" : t.id === "system" ? "bg-gradient-to-br from-white from-50% to-[#141232] to-50%" : "bg-[#0F0E28]")} aria-hidden>
                  <span className="mb-1.5 block h-2 w-10 rounded bg-primary/70" /><span className={cn("block h-2 w-16 rounded", t.id === "light" ? "bg-zinc-200" : "bg-white/15")} /><span className={cn("mt-1.5 block h-8 rounded", t.id === "light" ? "bg-zinc-100" : "bg-white/10")} />
                </span>
                <span className="flex items-start gap-2"><span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", theme === t.id ? "border-lavender" : "border-muted")}>{theme === t.id && <span className="size-2 rounded-full bg-lavender" />}</span>
                  <span className="leading-tight"><span className="block text-sm font-bold">{t.label}</span><span className="text-[11px] text-foreground/70">{t.desc}</span></span></span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Language" description="Set your preferred language and regional format." icon={<Globe />} tile />
          <div className="grid-cols-1 grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_1fr]">
            <div className="self-center"><Pick id="lang" label="Language"><Select id="lang" value={value.language} onChange={(e) => upd({ language: e.target.value })}><option>English</option></Select></Pick><p className="mt-2 text-[11px] text-muted">More languages are planned.</p></div>
            <div className="border-border sm:border-l sm:pl-5"><p className="mb-2 text-sm font-bold">Regional Format <span className="font-normal text-muted">(Preview)</span></p>
              <dl className="space-y-1.5 text-sm text-foreground/85"><div className="flex items-center gap-2"><Calendar className="size-4 text-lavender" aria-hidden /><dt>Date:</dt><dd>{preview.date}</dd></div><div className="flex items-center gap-2"><Clock className="size-4 text-lavender" aria-hidden /><dt>Time:</dt><dd>{preview.time}</dd></div><div className="flex items-center gap-2"><span className="grid-cols-1 grid size-4 place-items-center rounded border border-lavender/60 text-[8px] text-lavender" aria-hidden>123</span><dt>Number:</dt><dd>1,234.56</dd></div></dl></div>
          </div>
        </Card>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="Date & Time" description="Configure timezone and date/time preferences." icon={<Calendar />} tile />
          <div className="px-5 pb-4">
            <Row icon={Globe} label="Timezone"><Pick id="tz" label="Timezone"><Select id="tz" value={value.timezone} onChange={(e) => upd({ timezone: e.target.value })}>{["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"].map((z) => <option key={z}>{z}</option>)}</Select></Pick></Row>
            <Row icon={Calendar} label="Date Format"><Pick id="df" label="Date format"><Select id="df" value={value.dateFormat} onChange={(e) => upd({ dateFormat: e.target.value })}><option>MMM DD, YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></Select></Pick></Row>
            <Row icon={Clock} label="Time Format"><Pick id="tf" label="Time format"><Select id="tf" value={value.timeFormat} onChange={(e) => upd({ timeFormat: e.target.value })}><option>12-hour</option><option>24-hour</option></Select></Pick></Row>
            <Row icon={Calendar} label="First Day of Week"><Pick id="fd" label="First day of week"><Select id="fd" value={value.firstDay} onChange={(e) => upd({ firstDay: e.target.value })}><option>Monday</option><option>Sunday</option></Select></Pick></Row>
          </div></Card>
        <Card><CardHeader title="Dashboard Preferences" description="Customize your dashboard and default views." icon={<LayoutDashboard />} tile />
          <div className="px-5 pb-4">
            <Row icon={Home} label="Default Landing Page"><Pick id="lp" label="Default landing page"><Select id="lp" value={value.landing} onChange={(e) => upd({ landing: e.target.value })}><option>Dashboard</option><option>My Bots</option><option>Analytics</option></Select></Pick></Row>
            <Row icon={LayoutDashboard} label="Dashboard Layout"><Segmented label="Dashboard layout" value={value.layout} onChange={(v) => upd({ layout: v })} options={[{ id: "auto", label: "Auto" }, { id: "grid", label: "Grid" }, { id: "compact", label: "Compact" }]} /></Row>
            <Row icon={Bot} label="Default Bot View"><Pick id="bv" label="Default bot view"><Select id="bv" value={value.botView} onChange={(e) => upd({ botView: e.target.value })}><option>All Bots</option><option>Active Bots</option></Select></Pick></Row>
            <Row icon={Table2} label="Table Density"><Segmented label="Table density" value={value.density} onChange={(v) => upd({ density: v })} options={[{ id: "comfortable", label: "Comfortable" }, { id: "standard", label: "Standard" }, { id: "compact", label: "Compact" }]} /></Row>
            <Row icon={BarChart3} label="Show Dashboard Statistics" desc="Display key metrics (bots, executions, usage) on the dashboard." stack><div className="flex justify-end"><Switch label="Show dashboard statistics" checked={value.showStats} onCheckedChange={(v) => upd({ showStats: v })} /></div></Row>
          </div></Card>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card><CardHeader title="Editor Preferences" description="Configure your workflow editor experience." icon={<Code2 />} tile />
          <div className="px-5 pb-4">
            <Row icon={ScanSearch} label="Default Canvas Zoom"><div className="flex items-center gap-3"><input type="range" aria-label="Default canvas zoom" min={50} max={150} step={10} value={value.zoom} onChange={(e) => upd({ zoom: Number(e.target.value) })} className="flex-1" /><span className="w-12 text-right text-sm tabular-nums">{value.zoom}%</span></div></Row>
            {([["grid", Grid3x3, "Grid Visibility", "Show grid on the workflow canvas."], ["autosave", History, "Auto-save", "Automatically save changes while you work."], ["confirmPublish", ShieldCheck, "Confirmation Before Publishing", "Show a confirmation dialog before publishing a workflow."]] as const).map(([k, I, l, d]) => (
              <Row key={k} icon={I} label={l} desc={d} stack><div className="flex justify-end"><Switch label={l} checked={Boolean(value[k])} onCheckedChange={(v) => upd({ [k]: v } as Partial<State>)} /></div></Row>
            ))}
            <Row icon={Layers} label="Workflow Editor Theme"><Segmented label="Workflow editor theme" value={value.editorTheme} onChange={(v) => upd({ editorTheme: v })} options={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }, { id: "contrast", label: "High Contrast" }]} /></Row>
          </div></Card>
        <Card><CardHeader title="Accessibility" description="Make RelayNest more accessible and comfortable to use." icon={<Accessibility />} tile />
          <ul className="px-5 pb-4">
            {([["reduceMotion", Play, "Reduced Motion", "Minimize animations and motion effects across the app."], ["highContrast", Eye, "High Contrast", "Increase contrast for better readability."], ["compact", SlidersHorizontal, "Compact Interface", "Use a more condensed layout to fit more content on screen."], ["keyHints", Keyboard, "Keyboard Navigation Hints", "Show helpful shortcuts and key hints in the interface."]] as const).map(([k, I, l, d]) => (
              <li key={k} className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0"><I className="size-5 shrink-0 text-lavender" aria-hidden /><div className="flex-1 leading-tight"><p className="text-sm font-semibold">{l}</p><p className="text-[11px] text-foreground/70">{d}</p></div>
                <Switch label={l} checked={Boolean(value[k])} onCheckedChange={(v) => { const n = { ...value, [k]: v } as State; setValue(n); applyFlags(n); }} /></li>
            ))}
          </ul></Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button size="lg" onClick={async () => { if (await save(value)) toast.success("Preferences saved"); }}><Save className="size-4" />Save Preferences</Button>
        <Button size="lg" variant="outline" onClick={() => { setValue(d0); applyFlags(d0); setTheme("dark"); applyTheme("dark"); }}><RotateCcw className="size-4" />Reset to Defaults</Button>
      </div>
    </div>
  );
}
