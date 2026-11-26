"use client";

import {
  AlertTriangle, Bell, BellOff, BookOpen, Bot, Calendar, Check, CheckCheck, CheckCircle2, CreditCard, Globe, KeyRound,
  Loader2, LogIn, Mail, Megaphone, Moon, Plug, RotateCcw, Send, ShieldCheck, SlidersHorizontal, Sparkles, Tag, Trash2,
  Users, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  EMAIL_NOTIFICATION_KEYS,
  INAPP_CATEGORY_LABELS,
  INAPP_NOTIFICATION_KEYS,
  parseNotificationSettings,
  type EmailNotificationKey,
  type InAppNotificationKey,
  type NotificationFrequency,
  type NotificationSettings as NotificationSettingsState,
} from "@backend/lib/notifications";
import { TIMEZONE_CHOICES, formatUserDateTime } from "@backend/lib/preferences";
import { PageTitle } from "@/components/motion/split-text";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Radio } from "@/components/ui/choice";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Row<K extends string> = readonly [
  key: K,
  label: string,
  desc: string,
  icon: LucideIcon,
  tone: TileTone,
  badge?: string,
];

const EMAIL_ROWS: Row<EmailNotificationKey>[] = [
  ["accountSecurity", "Account security alerts", "Get emailed about password changes and revoked sessions.", ShieldCheck, "primary"],
  ["login", "Login notifications", "Get an email whenever a new sign-in is detected on your account.", LogIn, "primary", "Optional"],
  ["apiKeys", "API key & credential alerts", "Receive emails when API keys or bot tokens are created, rotated, or revoked.", KeyRound, "primary"],
  ["invites", "Workspace invitations", "Receive emails when you're invited to join a workspace.", Users, "primary"],
  ["botConnected", "Bot connection status", "Get notified when a Telegram bot or AI agent is connected.", Plug, "primary"],
  ["botOffline", "Bot disconnection alerts", "Get alerted when a bot is paused, deleted, or revoked on Telegram.", Zap, "danger"],
  ["automationFailures", "Automation execution failures", "Receive an email when an automation or scheduled task fails.", AlertTriangle, "danger"],
  ["workflowStatus", "Workflow status updates", "Get updates when workflows are published or paused.", Workflow, "primary"],
  ["billing", "Billing & plan alerts", "Payment receipts, renewals, cancellations, refunds, and plan limits.", CreditCard, "primary"],
  ["product", "Product announcements", "Be the first to know about major product news and releases.", Megaphone, "primary"],
  ["features", "Feature updates", "Get notified about new features and improvements.", Sparkles, "primary"],
  ["marketing", "Marketing communications", "Receive tips, best practices, events, and special offers.", Tag, "primary", "Optional"],
];

const INAPP_ROWS: Row<InAppNotificationKey>[] = [
  ["login", "Login notifications", "Show an in-app bell alert whenever you sign in to your account.", LogIn, "primary", "Optional"],
  ["security", "Account security alerts", "Password changes and sign-out of other active sessions.", ShieldCheck, "primary"],
  ["apiKeys", "API keys & credentials", "API key creation, rotation, revocation, deletion, and bot token updates.", KeyRound, "primary"],
  ["botActivity", "Bot activity & status", "Bot created, connected, updated, activated, paused, or deleted.", Bot, "primary"],
  ["aiAgents", "AI Agents", "AI agent creation, model or command updates, activation, and deletion.", Sparkles, "primary"],
  ["knowledgeBase", "Knowledge Base", "Collections updated and documents indexed or failed indexing.", BookOpen, "primary"],
  ["automationEvents", "Automation events", "Workflows created, published, paused, deleted, or scheduled runs completed.", Zap, "primary"],
  ["executionFailures", "Execution & delivery failures", "Failed workflow runs, AI agent reply errors, and webhook test failures.", AlertTriangle, "danger"],
  ["integrations", "Integrations & webhooks", "Slack, Discord, and webhook connections, tests, toggles, and triggers.", Plug, "primary"],
  ["billing", "Billing & plan usage", "Payments, plan activations, renewals, cancellations, and quota limits.", CreditCard, "primary"],
  ["workspace", "Workspace & profile updates", "Workspace settings, member invitations, and profile updates.", Users, "primary"],
  ["system", "System announcements", "Important platform updates and maintenance notices.", Megaphone, "primary"],
];

const FREQ: readonly [NotificationFrequency, string, string][] = [
  ["immediately", "Immediately", "Get notifications in real-time as they happen."],
  ["daily", "Daily summary", "Receive a single summary of non-critical updates once a day."],
  ["weekly", "Weekly summary", "Receive a weekly recap of important updates."],
  ["off", "Disabled", "Mute non-critical notifications (enabled critical alerts still deliver)."],
];

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const CACHE_KEY = "rn:notifications";

interface RecentNotification {
  id: string;
  kind: string;
  category?: InAppNotificationKey;
  title: string;
  body: string | null;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

const previews = [
  { id: "preview-telegram", category: "Bots", tone: "border-success/60 bg-success/10", icon: <Send className="size-4 text-info" />, t: "Telegram bot connected successfully", d: "Your Telegram bot \"@relaynest_bot\" is now connected and ready to use.", w: "2 min ago", href: "/bots" },
  { id: "preview-execution", category: "Failures", tone: "border-danger/60 bg-danger/10", icon: <AlertTriangle className="size-4 text-bad" />, t: "Automation execution failed", d: "The automation \"Daily Report\" failed to execute. Check the logs for more details.", w: "15 min ago", href: "/executions" },
  { id: "preview-kb", category: "Knowledge", tone: "border-info/60 bg-info/10", icon: <BookOpen className="size-4 text-lavender" />, t: "Document indexed: Support FAQ.pdf", d: "Ready for retrieval (18 chunks, vector embedded).", w: "1 hour ago", href: "/knowledge-base" },
  { id: "preview-security", category: "Security", tone: "border-warning/60 bg-warning/10", icon: <ShieldCheck className="size-4 text-warn" />, t: "Password changed", d: "Your account password was updated from Security & Access.", w: "3 hours ago", href: "/settings/security" },
];

function iconForCategory(category?: string, kind?: string): React.ReactNode {
  if (kind?.includes("failed") || kind === "plan_limit" || category === "executionFailures") return <AlertTriangle className="size-4 text-bad" />;
  switch (category) {
    case "login": return <LogIn className="size-4 text-lavender" />;
    case "security": return <ShieldCheck className="size-4 text-warn" />;
    case "apiKeys": return <KeyRound className="size-4 text-lavender" />;
    case "botActivity": return <Bot className="size-4 text-info" />;
    case "aiAgents": return <Sparkles className="size-4 text-lavender" />;
    case "knowledgeBase": return <BookOpen className="size-4 text-info" />;
    case "automationEvents": return <Zap className="size-4 text-lavender" />;
    case "integrations": return <Plug className="size-4 text-info" />;
    case "billing": return <CreditCard className="size-4 text-ok" />;
    case "workspace": return <Users className="size-4 text-lavender" />;
    default: return <Bell className="size-4 text-lavender" />;
  }
}

function Group<K extends string>({
  title,
  desc,
  icon: I,
  rows,
  values,
  onChange,
  onToggleAll,
}: {
  title: string;
  desc: string;
  icon: LucideIcon;
  rows: Row<K>[];
  values: Record<K, boolean>;
  onChange: (k: K, v: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
}) {
  const enabledCount = rows.filter(([k]) => Boolean(values[k])).length;
  const allEnabled = enabledCount === rows.length;
  return (
    <Card>
      <CardHeader
        title={title}
        description={desc}
        icon={<I />}
        tile
        action={
          <div className="flex items-center gap-2">
            <Badge tone="neutral" className="tabular-nums">{enabledCount}/{rows.length}</Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onToggleAll(!allEnabled)}
            >
              {allEnabled ? "Mute all" : "Enable all"}
            </Button>
          </div>
        }
      />
      <ul className="divide-y divide-border/50 px-5 pb-3">
        {rows.map(([key, label, d, Icon, tone, badge]) => (
          <li key={key} className="flex items-center gap-3 py-2.5">
            <IconTile size="md" tone={tone}><Icon /></IconTile>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <span>{label}</span>
                {badge && <Badge tone="neutral" className="px-1.5 py-0 text-[10px] font-semibold">{badge}</Badge>}
              </p>
              <p className="text-xs text-foreground/70">{d}</p>
            </div>
            <Switch label={label} checked={Boolean(values[key])} onCheckedChange={(v) => onChange(key, v)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function isEqualSettings(a: NotificationSettingsState, b: NotificationSettingsState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function NotificationSettings({
  initialSettings = DEFAULT_NOTIFICATION_SETTINGS,
  initialUpdatedAt = null,
  demo = false,
}: {
  initialSettings?: NotificationSettingsState;
  initialUpdatedAt?: string | null;
  demo?: boolean;
}) {
  const { prefs: userPrefs } = usePreferences();
  const [committed, setCommitted] = React.useState<NotificationSettingsState>(() => parseNotificationSettings(initialSettings));
  const [draft, setDraft] = React.useState<NotificationSettingsState>(() => parseNotificationSettings(initialSettings));
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(initialUpdatedAt);
  const [saving, setSaving] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentNotification[] | null>(null);
  const [clearingRead, setClearingRead] = React.useState(false);

  // In demo mode without Supabase, load any locally cached notification settings.
  React.useEffect(() => {
    if (!demo) return;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = parseNotificationSettings(JSON.parse(raw));
        setCommitted(parsed);
        setDraft(parsed);
      }
    } catch { /* ignore corrupt cache */ }
  }, [demo]);

  const loadRecent = React.useCallback(async () => {
    if (demo) return;
    const res = await api<{ items: RecentNotification[]; unread: number }>("/api/v1/notifications?limit=6");
    if (res.ok) setRecent(res.data.items);
  }, [demo]);

  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const dirty = React.useMemo(() => !isEqualSettings(draft, committed), [draft, committed]);
  const allOn = React.useMemo(
    () =>
      EMAIL_NOTIFICATION_KEYS.every((k) => draft.email[k]) &&
      INAPP_NOTIFICATION_KEYS.every((k) => draft.inapp[k]),
    [draft],
  );

  const upd = (patch: Partial<NotificationSettingsState>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  async function handleSave() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    if (demo) {
      setCommitted(draft);
      setUpdatedAt(new Date().toISOString());
      toast.success("Notification preferences saved locally (demo mode)");
      return;
    }
    setSaving(true);
    const res = await api<{ settings: NotificationSettingsState; updatedAt: string | null }>("/api/v1/settings/notifications", {
      method: "PUT",
      body: draft,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const saved = parseNotificationSettings(res.data.settings);
    setCommitted(saved);
    setDraft(saved);
    setUpdatedAt(res.data.updatedAt ?? new Date().toISOString());
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    toast.success("Notification preferences synced to your account");
  }

  async function handleReset() {
    const defaults = parseNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(defaults)); } catch { /* ignore */ }
    if (demo) {
      setCommitted(defaults);
      setDraft(defaults);
      setUpdatedAt(new Date().toISOString());
      toast.success("Notification preferences reset to defaults");
      return;
    }
    setResetting(true);
    const res = await api<{ settings: NotificationSettingsState; updatedAt: string | null }>("/api/v1/settings/notifications", {
      method: "DELETE",
    });
    setResetting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const saved = parseNotificationSettings(res.data.settings);
    setCommitted(saved);
    setDraft(saved);
    setUpdatedAt(res.data.updatedAt ?? new Date().toISOString());
    toast.success("Notification preferences reset to defaults");
  }

  async function handleClearRead() {
    if (demo) return;
    setClearingRead(true);
    const res = await api("/api/v1/notifications", { method: "DELETE", body: { clearRead: true } });
    setClearingRead(false);
    if (res.ok) {
      toast.success("Cleared read notifications");
      await loadRecent();
    } else {
      toast.error(res.message);
    }
  }

  const hasReadRecent = Boolean(recent?.some((n) => Boolean(n.read_at)));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><Bell /></IconTile>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Notifications" /></h1>
            <p className="text-sm text-foreground/80">
              Control every email and in-app alert independently. Login alerts are optional and all preferences sync to Supabase.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Badge tone="warning" dot>Unsaved changes</Badge>
          ) : updatedAt ? (
            <Badge tone="success" className="gap-1.5">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Synced {formatUserDateTime(updatedAt, userPrefs)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-2">
        <Group
          title="Email Notifications"
          desc="Receive important updates and alerts in your email."
          icon={Mail}
          rows={EMAIL_ROWS}
          values={draft.email}
          onChange={(k, v) => upd({ email: { ...draft.email, [k]: v } })}
          onToggleAll={(enabled) =>
            upd({
              email: Object.fromEntries(EMAIL_NOTIFICATION_KEYS.map((k) => [k, enabled])) as NotificationSettingsState["email"],
            })
          }
        />
        <Group
          title="In-App Notifications"
          desc="Choose which real-time updates appear in your RelayNest bell."
          icon={Bell}
          rows={INAPP_ROWS}
          values={draft.inapp}
          onChange={(k, v) => upd({ inapp: { ...draft.inapp, [k]: v } })}
          onToggleAll={(enabled) =>
            upd({
              inapp: Object.fromEntries(INAPP_NOTIFICATION_KEYS.map((k) => [k, enabled])) as NotificationSettingsState["inapp"],
            })
          }
        />
      </div>

      <div className="grid-cols-1 grid gap-5 lg:grid-cols-[1fr_1fr] xl:grid-cols-[0.9fr_1fr_1fr]">
        <Card>
          <CardHeader title="Notification Frequency" description="Choose how often you want to receive non-critical notifications." icon={<Calendar />} tile />
          <div role="radiogroup" aria-label="Frequency" className="space-y-2 px-5 pb-5">
            {FREQ.map(([id, label, desc]) => (
              <div key={id} className={cn("rounded-xl border p-3 transition", draft.frequency === id ? "border-lavender bg-primary/15" : "border-border bg-surface-2/50 hover:border-lavender/50")}>
                <Radio
                  name="freq"
                  wrapperClassName="items-start w-full"
                  checked={draft.frequency === id}
                  onChange={() => upd({ frequency: id })}
                  label={
                    <span className="leading-tight">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="text-xs text-foreground/70">{desc}</span>
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notification Preferences" description="Global delivery rules and quiet hours enforced by the backend." icon={<SlidersHorizontal />} tile />
          <ul className="divide-y divide-border/50 px-5 pb-4">
            <li className="flex items-center gap-3 py-3">
              <IconTile size="md" tone="primary"><CheckCheck /></IconTile>
              <div className="flex-1 leading-tight">
                <p className="text-sm font-bold">Enable all notifications</p>
                <p className="text-xs text-foreground/70">Turn on every email and in-app notification category.</p>
              </div>
              <Switch
                label="Enable all notifications"
                checked={allOn}
                onCheckedChange={(v) =>
                  upd({
                    email: Object.fromEntries(EMAIL_NOTIFICATION_KEYS.map((k) => [k, v])) as NotificationSettingsState["email"],
                    inapp: Object.fromEntries(INAPP_NOTIFICATION_KEYS.map((k) => [k, v])) as NotificationSettingsState["inapp"],
                  })
                }
              />
            </li>
            <li className="flex items-center gap-3 py-3">
              <IconTile size="md" tone="primary"><BellOff /></IconTile>
              <div className="flex-1 leading-tight">
                <p className="text-sm font-bold">Disable all non-critical notifications</p>
                <p className="text-xs text-foreground/70">Only send enabled critical alerts (security, API keys, failures, billing, and logins if enabled).</p>
              </div>
              <Switch label="Disable non-critical notifications" checked={draft.disableNonCritical} onCheckedChange={(v) => upd({ disableNonCritical: v })} />
            </li>
            <li className="py-3">
              <div className="flex items-center gap-3">
                <IconTile size="md" tone="primary"><Moon /></IconTile>
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-bold">Quiet hours</p>
                  <p className="text-xs text-foreground/70">Mute non-critical email &amp; in-app alerts during these hours.</p>
                </div>
                <Switch label="Quiet hours" checked={draft.quiet} onCheckedChange={(v) => upd({ quiet: v })} />
              </div>
              <div className="grid-cols-1 mt-3 grid grid-cols-2 gap-3 pl-[52px]">
                <label className="text-xs font-semibold">
                  From
                  <Select className="mt-1" value={draft.from} disabled={!draft.quiet} onChange={(e) => upd({ from: e.target.value })}>
                    {ALL_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-semibold">
                  To
                  <Select className="mt-1" value={draft.to} disabled={!draft.quiet} onChange={(e) => upd({ to: e.target.value })}>
                    {ALL_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </label>
              </div>
            </li>
            <li className="flex items-center gap-3 py-3">
              <IconTile size="md" tone="primary"><Globe /></IconTile>
              <div className="flex-1 leading-tight">
                <label htmlFor="tz" className="text-sm font-bold">Timezone</label>
                <p className="mb-1.5 text-xs text-foreground/70">Used to evaluate quiet hours and scheduled summaries.</p>
                <Select id="tz" value={draft.timezone} onChange={(e) => upd({ timezone: e.target.value as NotificationSettingsState["timezone"] })}>
                  {TIMEZONE_CHOICES.map((z) => <option key={z} value={z}>{z}</option>)}
                </Select>
              </div>
            </li>
          </ul>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title={recent && recent.length > 0 ? "Recent Notifications" : "Notification Preview"}
            description={recent && recent.length > 0 ? "Latest alerts stored in your account." : "See how your notifications will look."}
            icon={<Bell />}
            tile
            action={
              hasReadRecent ? (
                <Button type="button" size="sm" variant="outline" disabled={clearingRead} onClick={() => void handleClearRead()}>
                  <Trash2 className="size-3.5" aria-hidden />
                  {clearingRead ? "Clearing..." : "Clear read"}
                </Button>
              ) : undefined
            }
          />
          <ul className="space-y-2.5 px-5 pb-5" aria-label="Recent notifications">
            {(recent && recent.length > 0
              ? recent.map((n) => ({
                  id: n.id,
                  category: n.category ? INAPP_CATEGORY_LABELS[n.category] : undefined,
                  tone:
                    n.kind.includes("failed") || n.kind === "plan_limit" || n.category === "executionFailures"
                      ? "border-danger/60 bg-danger/10"
                      : n.kind.startsWith("payment") || n.kind.startsWith("plan") || n.category === "billing"
                        ? "border-success/60 bg-success/10"
                        : n.category === "security"
                          ? "border-warning/60 bg-warning/10"
                          : "border-info/60 bg-info/10",
                  icon: iconForCategory(n.category, n.kind),
                  t: n.title,
                  d: n.body ?? "",
                  w: formatUserDateTime(n.created_at, userPrefs),
                  href: n.action_url ?? null,
                }))
              : previews
            ).map((p) => (
              <li key={p.id} className={cn("rounded-xl border p-3 transition", p.tone)}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0" aria-hidden>{p.icon}</span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-sm font-bold">
                        {p.href ? (
                          <Link href={p.href} className="hover:underline">{p.t}</Link>
                        ) : p.t}
                      </p>
                      {p.category && <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">{p.category}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-foreground/80">{p.d}</p>
                    <span className="mt-1 block text-[11px] text-foreground/65">{p.w}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button size="lg" onClick={() => void handleSave()} disabled={saving || resetting}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
        <Button size="lg" variant="outline" onClick={() => void handleReset()} disabled={saving || resetting}>
          {resetting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
          {resetting ? "Resetting..." : "Reset to Default"}
        </Button>
      </div>
    </div>
  );
}
