"use client";

import {
  AlertTriangle, Bell, BellOff, Calendar, Check, CheckCheck, Globe, LogIn, Megaphone, Moon, Plug, RotateCcw, Send, ShieldCheck,
  SlidersHorizontal, Sparkles, Tag, Users, Workflow, Zap, Bot, Mail, type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Radio } from "@/components/ui/choice";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSyncedSetting } from "@/lib/use-synced-setting";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/motion/split-text";

type Row = readonly [key: string, label: string, desc: string, icon: LucideIcon, tone: TileTone];

const EMAIL: Row[] = [
  ["accountSecurity", "Account security alerts", "Get notified about security-related events (e.g., password changes, 2FA).", ShieldCheck, "primary"],
  ["login", "Login notifications", "Get an email when a new login is detected on your account.", LogIn, "primary"],
  ["invites", "Workspace invitations", "Receive emails when you're invited to join a workspace.", Users, "primary"],
  ["botConnected", "Bot connection status", "Get notified when a bot is connected successfully.", Plug, "primary"],
  ["botOffline", "Bot disconnection alerts", "Get alerted when a connected bot goes offline.", Zap, "danger"],
  ["automationFailures", "Automation execution failures", "Receive an email when an automation or scheduled task fails.", AlertTriangle, "primary"],
  ["workflowStatus", "Workflow status updates", "Get updates on workflow executions, completions, and errors.", Workflow, "primary"],
  ["product", "Product announcements", "Be the first to know about major product news and releases.", Megaphone, "primary"],
  ["features", "Feature updates", "Get notified about new features and improvements.", Sparkles, "primary"],
  ["marketing", "Marketing communications", "Receive tips, best practices, events, and special offers.", Tag, "primary"],
];
const INAPP: Row[] = [
  ["botActivity", "Bot activity", "Get notified about bot events (connected, disconnected, errors).", Bot, "primary"],
  ["automationEvents", "Automation events", "Get updates when automations start, complete, or are scheduled.", Zap, "primary"],
  ["executionFailures", "Execution failures", "Receive in-app alerts for failed automations or workflow runs.", AlertTriangle, "danger"],
  ["workspace", "Workspace updates", "Get notified about changes in your workspace (members, roles, settings).", Users, "primary"],
  ["system", "System announcements", "Important platform updates and maintenance notices.", Megaphone, "primary"],
  ["security", "Security alerts", "Get alerted about critical security events (e.g., new login, suspicious activity).", ShieldCheck, "primary"],
];

const toMap = (rows: Row[], off: string[] = []) => Object.fromEntries(rows.map(([k]) => [k, !off.includes(k)])) as Record<string, boolean>;
const defaults = {
  email: toMap(EMAIL, ["marketing"]), inapp: toMap(INAPP),
  frequency: "immediately", disableNonCritical: false, quiet: true, from: "22:00", to: "07:00", timezone: "Asia/Kolkata",
};
type State = typeof defaults;

const FREQ = [["immediately", "Immediately", "Get notifications in real-time as they happen."], ["daily", "Daily summary", "Receive a single email with a summary of all updates once a day."], ["weekly", "Weekly summary", "Receive a weekly recap of important updates."], ["off", "Disabled", "Do not receive non-critical notifications."]] as const;
const hours = (from: number) => Array.from({ length: 8 }, (_, i) => `${String((from + i) % 24).padStart(2, "0")}:00`);
const TZ = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

function Group({ title, desc, icon: I, rows, values, onChange }: { title: string; desc: string; icon: LucideIcon; rows: Row[]; values: Record<string, boolean>; onChange: (k: string, v: boolean) => void }) {
  return (
    <Card>
      <CardHeader title={title} description={desc} icon={<I />} tile />
      <ul className="divide-y divide-border/50 px-5 pb-3">
        {rows.map(([key, label, d, Icon, tone]) => (
          <li key={key} className="flex items-center gap-3 py-2.5">
            <IconTile size="md" tone={tone}><Icon /></IconTile>
            <div className="min-w-0 flex-1 leading-tight"><p className="text-sm font-bold">{label}</p><p className="text-xs text-foreground/70">{d}</p></div>
            <Switch label={label} checked={Boolean(values[key])} onCheckedChange={(v) => onChange(key, v)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

const previews = [
  { id: "preview-telegram", tone: "border-success/60 bg-success/10", icon: <Send className="size-4 text-info" />, t: "Telegram bot connected successfully", d: "Your Telegram bot \"@relaynest_bot\" is now connected and ready to use.", w: "2 min ago" },
  { id: "preview-execution", tone: "border-danger/60 bg-danger/10", icon: <Zap className="size-4 text-bad" />, t: "Automation execution failed", d: "The automation \"Daily Report\" failed to execute. Check the logs for more details.", w: "15 min ago" },
  { id: "preview-invite", tone: "border-info/60 bg-info/10", icon: <Users className="size-4 text-lavender" />, t: "New workspace invitation", d: "You've been invited to join the \"Marketing Team\" workspace by Pratik Patil.", w: "1 hour ago" },
  { id: "preview-security", tone: "border-warning/60 bg-warning/10", icon: <ShieldCheck className="size-4 text-warn" />, t: "Security alert", d: "A new login to your account was detected from Windows PC (Kolkata, IN).", w: "3 hours ago" },
];

export function NotificationSettings() {
  const { value, setValue, save, loaded, error, defaults: d0 } = useSyncedSetting<State>("notifications", defaults);
  const [recent, setRecent] = React.useState<{ id: string; kind: string; title: string; body: string | null; created_at: string }[] | null>(null);
  React.useEffect(() => { if (error) toast.error(error); }, [error]);
  React.useEffect(() => {
    fetch("/api/v1/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data?.items) setRecent(j.data.items.slice(0, 4)); })
      .catch(() => undefined);
  }, []);
  const upd = (patch: Partial<State>) => { setValue({ ...value, ...patch }); };
  if (!loaded) return null;
  const allOn = [...Object.values(value.email), ...Object.values(value.inapp)].every(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><Bell /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Notifications" /></h1><p className="text-sm text-foreground/80">Control how and when RelayNest communicates with you. Preferences are synced to your account.</p></div></div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Group title="Email Notifications" desc="Receive important updates and alerts in your email." icon={Mail} rows={EMAIL} values={value.email} onChange={(k, v) => upd({ email: { ...value.email, [k]: v } })} />
        <Group title="In-App Notifications" desc="See real-time updates inside RelayNest." icon={Bell} rows={INAPP} values={value.inapp} onChange={(k, v) => upd({ inapp: { ...value.inapp, [k]: v } })} />
      </div>

      <div className="grid-cols-1 grid gap-5 lg:grid-cols-[1fr_1fr] xl:grid-cols-[0.9fr_1fr_1fr]">
        <Card>
          <CardHeader title="Notification Frequency" description="Choose how often you want to receive non-critical notifications." icon={<Calendar />} tile />
          <div role="radiogroup" aria-label="Frequency" className="space-y-2 px-5 pb-5">
            {FREQ.map(([id, label, desc]) => (
              <div key={id} className={cn("rounded-xl border p-3 transition", value.frequency === id ? "border-lavender bg-primary/15" : "border-border bg-surface-2/50 hover:border-lavender/50")}>
                <Radio name="freq" wrapperClassName="items-start w-full" checked={value.frequency === id} onChange={() => upd({ frequency: id })} label={<span className="leading-tight"><span className="block text-sm font-bold">{label}</span><span className="text-xs text-foreground/70">{desc}</span></span>} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notification Preferences" description="Additional options to customize your notifications." icon={<SlidersHorizontal />} tile />
          <ul className="divide-y divide-border/50 px-5 pb-4">
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><CheckCheck /></IconTile><div className="flex-1 leading-tight"><p className="text-sm font-bold">Enable all notifications</p><p className="text-xs text-foreground/70">Turn on all email and in-app notifications.</p></div>
              <Switch label="Enable all notifications" checked={allOn} onCheckedChange={(v) => upd({ email: toMap(EMAIL, v ? [] : EMAIL.map(([k]) => k)), inapp: toMap(INAPP, v ? [] : INAPP.map(([k]) => k)) })} /></li>
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><BellOff /></IconTile><div className="flex-1 leading-tight"><p className="text-sm font-bold">Disable all non-critical notifications</p><p className="text-xs text-foreground/70">Keep only critical alerts (security, login, and account updates).</p></div>
              <Switch label="Disable non-critical notifications" checked={value.disableNonCritical} onCheckedChange={(v) => upd({ disableNonCritical: v })} /></li>
            <li className="py-3"><div className="flex items-center gap-3"><IconTile size="md" tone="primary"><Moon /></IconTile><div className="flex-1 leading-tight"><p className="text-sm font-bold">Quiet hours</p><p className="text-xs text-foreground/70">Mute non-critical notifications during specific hours.</p></div>
              <Switch label="Quiet hours" checked={value.quiet} onCheckedChange={(v) => upd({ quiet: v })} /></div>
              <div className="grid-cols-1 mt-3 grid grid-cols-2 gap-3 pl-[52px]">
                <label className="text-xs font-semibold">From<Select className="mt-1" value={value.from} disabled={!value.quiet} onChange={(e) => upd({ from: e.target.value })}>{hours(20).map((h) => <option key={h}>{h}</option>)}</Select></label>
                <label className="text-xs font-semibold">To<Select className="mt-1" value={value.to} disabled={!value.quiet} onChange={(e) => upd({ to: e.target.value })}>{hours(5).map((h) => <option key={h}>{h}</option>)}</Select></label>
              </div></li>
            <li className="flex items-center gap-3 py-3"><IconTile size="md" tone="primary"><Globe /></IconTile><div className="flex-1 leading-tight"><label htmlFor="tz" className="text-sm font-bold">Timezone</label><p className="mb-1.5 text-xs text-foreground/70">Used for scheduled notifications and summaries.</p>
              <Select id="tz" value={value.timezone} onChange={(e) => upd({ timezone: e.target.value })}>{TZ.map((z) => <option key={z}>{z}</option>)}</Select></div></li>
          </ul>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title={recent && recent.length > 0 ? "Recent Notifications" : "Notification Preview"} description={recent && recent.length > 0 ? "Latest alerts stored in your account." : "See how your notifications will look."} icon={<Bell />} tile />
          <ul className="space-y-2.5 px-5 pb-5" aria-label="Recent notifications">
            {(recent && recent.length > 0
              ? recent.map((n) => ({
                  id: n.id,
                  tone: n.kind.includes("failed") || n.kind === "plan_limit" ? "border-danger/60 bg-danger/10" : n.kind.startsWith("payment") || n.kind.startsWith("plan") ? "border-success/60 bg-success/10" : "border-info/60 bg-info/10",
                  icon: <Bell className="size-4 text-lavender" />,
                  t: n.title,
                  d: n.body ?? "",
                  w: new Date(n.created_at).toLocaleDateString(),
                }))
              : previews
            ).map((p) => (
              <li key={p.id} className={cn("flex items-start gap-3 rounded-xl border p-3", p.tone)}>
                <span className="mt-0.5 shrink-0" aria-hidden>{p.icon}</span>
                <div className="min-w-0 flex-1 leading-tight"><p className="text-sm font-bold">{p.t}</p><p className="mt-0.5 text-xs text-foreground/80">{p.d}</p></div>
                <span className="shrink-0 text-[11px] text-foreground/70">{p.w}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button onClick={async () => { if (await save(value)) toast.success("Preferences saved"); }}><Check className="size-4" />Save Preferences</Button>
        <Button variant="outline" onClick={() => { setValue(d0); }}><RotateCcw className="size-4" />Reset to Default</Button>
      </div>
    </div>
  );
}
