"use client";

import {
  Activity, ArrowRight, BookOpen, Check, Copy, Play, Plug, Plus, RefreshCw, Send,
  Trash2, Webhook,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { INTEGRATION_EVENT_META, type IntegrationEvent } from "@backend/lib/api/openapi";
import type { IntegrationsPageData } from "@backend/server/services/integrations";
import { PageTitle } from "@/components/motion/split-text";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<"slack" | "discord" | "webhook", { name: string; placeholder: string; hint: string }> = {
  webhook: {
    name: "Custom HTTPS Webhook",
    placeholder: "https://api.example.com/webhooks/relaynest",
    hint: "Receives signed JSON POST payloads with X-RelayNest-Signature (HMAC-SHA256).",
  },
  slack: {
    name: "Slack Incoming Webhook",
    placeholder: "https://hooks.slack.com/services/T000/B000/XXXX",
    hint: "Formats workspace alerts as rich Slack blocks into your chosen channel.",
  },
  discord: {
    name: "Discord Webhook",
    placeholder: "https://discord.com/api/webhooks/123456/token",
    hint: "Posts real-time bot lifecycle and automation alerts directly to Discord.",
  },
};

export function IntegrationsHub({ initialData, appUrl }: { initialData: IntegrationsPageData; appUrl: string }) {
  const [data, setData] = React.useState<IntegrationsPageData>(initialData);
  const [addOpen, setAddOpen] = React.useState(false);
  const [hookModalOpen, setHookModalOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [guideTab, setGuideTab] = React.useState<"incoming" | "outgoing">("incoming");

  // Outbound integration form
  const [provider, setProvider] = React.useState<"webhook" | "slack" | "discord">("webhook");
  const [name, setName] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [signingSecret, setSigningSecret] = React.useState("");
  const [events, setEvents] = React.useState<IntegrationEvent[]>(["bot.created", "automation.published", "execution.failed"]);
  const [savingInt, setSavingInt] = React.useState(false);

  // Incoming webhook form + secret reveal
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState(initialData.workflows[0]?.id ?? "");
  const [savingHook, setSavingHook] = React.useState(false);
  const [revealedHook, setRevealedHook] = React.useState<{ workflowName: string; url: string; secret: string } | null>(null);

  async function refresh() {
    const res = await api<IntegrationsPageData>("/api/v1/integrations");
    if (res.ok) {
      setData(res.data);
      if (!selectedWorkflowId && res.data.workflows[0]) {
        setSelectedWorkflowId(res.data.workflows[0].id);
      }
    }
  }

  function toggleEvent(ev: IntegrationEvent) {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  }

  async function copyText(val: string, label: string) {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy unavailable — select text manually.");
    }
  }

  async function handleCreateIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !webhookUrl.trim()) return toast.error("Enter integration name and HTTPS webhook URL.");
    if (events.length === 0) return toast.error("Select at least one subscribed event.");
    setSavingInt(true);
    const res = await api("/api/v1/integrations", {
      body: {
        provider,
        name: name.trim(),
        webhookUrl: webhookUrl.trim(),
        signingSecret: signingSecret.trim() || undefined,
        events,
      },
    });
    setSavingInt(false);
    if (!res.ok) return toast.error(res.message);
    toast.success("Integration connected & notification recorded");
    setAddOpen(false);
    setName("");
    setWebhookUrl("");
    setSigningSecret("");
    await refresh();
  }

  async function handleToggleIntegration(id: string, enabled: boolean) {
    setBusyId(id);
    const res = await api(`/api/v1/integrations/${id}`, { method: "PATCH", body: { enabled } });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    toast.success(enabled ? "Integration enabled" : "Integration paused");
    await refresh();
  }

  async function handleTestIntegration(id: string, intName: string) {
    setBusyId(id);
    const res = await api<{ delivered: boolean; statusCode: number; latencyMs: number; error: string | null }>(
      `/api/v1/integrations/${id}/test`,
      { method: "POST", body: {} },
    );
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    if (res.data.delivered) {
      toast.success(`${intName}: HTTP ${res.data.statusCode} in ${res.data.latencyMs}ms`);
    } else {
      toast.error(`${intName}: ${res.data.error ?? "Delivery failed"}`);
    }
    await refresh();
  }

  async function handleDeleteIntegration(id: string, intName: string) {
    setBusyId(id);
    const res = await api(`/api/v1/integrations/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    toast.success(`Removed "${intName}"`);
    await refresh();
  }

  async function handleProvisionWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkflowId) return toast.error("Create an automation workflow first.");
    setSavingHook(true);
    const res = await api<{ endpoint: { workflowName: string; url: string }; secret: string }>("/api/v1/integrations/webhooks", {
      body: { workflowId: selectedWorkflowId },
    });
    setSavingHook(false);
    if (!res.ok) return toast.error(res.message);
    toast.success("Incoming webhook provisioned");
    setHookModalOpen(false);
    setRevealedHook({ workflowName: res.data.endpoint.workflowName, url: res.data.endpoint.url, secret: res.data.secret });
    await refresh();
  }

  async function handleToggleWebhook(id: string, enabled: boolean) {
    setBusyId(id);
    const res = await api(`/api/v1/integrations/webhooks/${id}`, { method: "PATCH", body: { enabled } });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    toast.success(enabled ? "Incoming webhook active" : "Incoming webhook paused");
    await refresh();
  }

  async function handleDeleteWebhook(id: string) {
    setBusyId(id);
    const res = await api(`/api/v1/integrations/webhooks/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    toast.success("Incoming webhook deleted");
    await refresh();
  }

  const [origin, setOrigin] = React.useState(appUrl);
  React.useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const guideSnippets = {
    incoming: `# Trigger any active RelayNest workflow via HTTPS POST:\ncurl -X POST "${data.webhookEndpoints[0]?.url ?? `${origin}/api/webhooks/workflows/YOUR_ENDPOINT_ID`}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-RelayNest-Secret: YOUR_WEBHOOK_SECRET" \\\n  -H "Idempotency-Key: order-9021" \\\n  -d '{"orderId":"ORD-9021","customer":"Ishan","status":"paid"}'`,
    outgoing: `// Verify outbound RelayNest webhook signature in Node.js:\nimport crypto from "node:crypto";\n\nexport function verifyRelayNestWebhook(rawBody, signatureHeader, secret) {\n  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");\n  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));\n}`,
  };

  return (
    <div className="mx-auto max-w-[1320px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><Plug /></IconTile>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Integrations" /></h1>
            <p className="text-sm text-foreground/80">
              Connect Telegram bots, signed incoming webhook triggers, outbound Slack/Discord channels, and workspace REST APIs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/docs#integrations" variant="outline" size="md">
            <BookOpen className="size-4" aria-hidden /> Integration Guide
          </ButtonLink>
          <Button onClick={() => setAddOpen(true)} disabled={data.demo}>
            <Plus className="size-4" aria-hidden /> Connect Integration
          </Button>
        </div>
      </div>

      {data.demo && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warn">
          Sign in with Supabase configured to save live webhooks and external channel integrations.
        </div>
      )}

      {/* 1. Telegram Live Bridges */}
      <Card>
        <CardHeader
          title="Telegram Bot Channels"
          description="Live connected bots synchronized two-way with Telegram Bot API."
          icon={<Send />}
          tile
          action={
            <ButtonLink href="/bots/new" size="sm" variant="subtle">
              <Plus className="size-3.5" aria-hidden /> Connect Telegram Bot
            </ButtonLink>
          }
        />
        <div className="px-5 pb-5">
          {data.bots.length === 0 ? (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
              <span>No Telegram bots connected in this workspace yet.</span>
              <ButtonLink href="/bots/new" size="sm">Create Bot</ButtonLink>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.bots.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/bots/${b.id}`} className="font-semibold hover:text-lavender hover:underline">
                      {b.name}
                    </Link>
                    {b.username && <span className="ml-2 text-xs text-muted">@{b.username}</span>}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{b.messagesCount} msgs</Badge>
                    <Badge tone={b.status === "active" ? "success" : "neutral"} dot>{b.status}</Badge>
                    <Badge tone={b.webhookStatus === "registered" || b.webhookStatus === "polling" ? "success" : "neutral"}>
                      {b.webhookStatus === "polling" ? "updates: polling" : `webhook: ${b.webhookStatus}`}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* 2. Incoming & Outbound Channels Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Incoming Webhooks */}
        <Card>
          <CardHeader
            title="Incoming Webhooks"
            description="Trigger any RelayNest automation from Stripe, websites, or external servers."
            icon={<Webhook />}
            tile
            action={
              <Button size="sm" onClick={() => setHookModalOpen(true)} disabled={data.demo || data.workflows.length === 0}>
                <Plus className="size-3.5" aria-hidden /> Add Webhook Trigger
              </Button>
            }
          />
          <div className="space-y-3 px-5 pb-5">
            {data.webhookEndpoints.length === 0 ? (
              <div className="panel p-4 text-sm text-muted">
                {data.workflows.length === 0
                  ? "Create an automation under Automations first, then generate a signed incoming webhook URL here."
                  : "No incoming webhooks generated yet. Click Add Webhook Trigger above to generate a URL & secret."}
              </div>
            ) : (
              data.webhookEndpoints.map((ep) => (
                <div key={ep.id} className="panel space-y-2.5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{ep.workflowName}</span>
                      <Badge tone={ep.enabled ? "success" : "neutral"} dot>{ep.enabled ? "enabled" : "paused"}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        label={`Toggle webhook for ${ep.workflowName}`}
                        checked={ep.enabled}
                        onCheckedChange={(v) => void handleToggleWebhook(ep.id, v)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === ep.id}
                        onClick={() => void handleDeleteWebhook(ep.id)}
                        aria-label={`Delete incoming webhook for ${ep.workflowName}`}
                      >
                        <Trash2 className="size-3.5 text-bad" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-[#08081A] px-2.5 py-1.5">
                    <code className="flex-1 truncate font-mono text-[11px] text-lavender">{ep.url}</code>
                    <button
                      type="button"
                      onClick={() => void copyText(ep.url, "Webhook URL")}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-foreground/85 hover:bg-primary/20"
                    >
                      <Copy className="size-3" aria-hidden /> Copy URL
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* External Outbound Integrations (Slack, Discord, Webhook) */}
        <Card>
          <CardHeader
            title="Outbound Channel Integrations"
            description="Deliver real-time bot & automation notifications to Slack, Discord, or custom REST APIs."
            icon={<Activity />}
            tile
            action={
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={data.demo}>
                <Plus className="size-3.5" aria-hidden /> Connect Channel
              </Button>
            }
          />
          <div className="space-y-3 px-5 pb-5">
            {data.integrations.length === 0 ? (
              <div className="panel space-y-2 p-4 text-sm text-muted">
                <p>No external channels connected yet. Connect Slack, Discord, or any HTTPS endpoint to receive live signed notifications.</p>
              </div>
            ) : (
              data.integrations.map((intg) => (
                <div key={intg.id} className="panel space-y-2.5 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info" className="uppercase">{intg.provider}</Badge>
                      <span className="font-bold text-sm">{intg.name}</span>
                      <Badge tone={intg.status === "active" ? "success" : "neutral"} dot>{intg.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === intg.id}
                        onClick={() => void handleTestIntegration(intg.id, intg.name)}
                      >
                        <Play className="size-3" aria-hidden /> {busyId === intg.id ? "Testing..." : "Test Ping"}
                      </Button>
                      <Switch
                        label={`Toggle ${intg.name}`}
                        checked={intg.status === "active"}
                        onCheckedChange={(v) => void handleToggleIntegration(intg.id, v)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === intg.id}
                        onClick={() => void handleDeleteIntegration(intg.id, intg.name)}
                        aria-label={`Delete integration ${intg.name}`}
                      >
                        <Trash2 className="size-3.5 text-bad" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <code className="font-mono text-[11px]">{intg.targetPreview ?? "Encrypted endpoint"}</code>
                    <span>
                      {intg.lastTestedAt
                        ? `Last test: ${intg.lastStatus ?? "OK"} (${new Date(intg.lastTestedAt).toLocaleTimeString()})`
                        : "Not tested yet"}
                    </span>
                  </div>
                  {intg.lastError && (
                    <p className="rounded bg-danger/10 px-2 py-1 text-[11px] text-bad">{intg.lastError}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {intg.events.map((ev) => (
                      <Badge key={ev} tone="neutral" className="text-[10px] font-normal">{ev}</Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* 3. How to Integrate Step-by-Step Guide & API Docs Links */}
      <Card>
        <CardHeader
          title="How to Integrate with RelayNest"
          description="Step-by-step instructions for Telegram bridges, incoming triggers, and verified outbound webhooks."
          icon={<BookOpen />}
          tile
          action={
            <div className="inline-flex rounded-lg border border-border/80 bg-surface-2/80 p-0.5 text-xs">
              {([
                ["incoming", "Incoming Webhook"],
                ["outgoing", "Verify Signature"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGuideTab(key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition",
                    guideTab === key ? "bg-primary text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[1fr_1.15fr]">
          <ol className="space-y-3 text-sm">
            {[
              [
                "1. Telegram Two-Way Bridge",
                "Connect a bot under My Bots -> Create Bot. RelayNest syncs commands, avatars, and deleted states two-way automatically.",
              ],
              [
                "2. Trigger Workflows via Incoming Webhooks",
                "Provision an endpoint above, copy its URL & secret, and POST JSON from forms or backends with X-RelayNest-Secret.",
              ],
              [
                "3. Forward Alerts to Slack, Discord or HTTPS",
                "Add a Slack, Discord, or Custom Webhook integration above, tick events, and verify HMAC signatures via X-RelayNest-Signature.",
              ],
              [
                "4. Inspect Telegram & Webhook Alerts Live",
                "Monitor Test Ping latency, delivery HTTP codes, and automatic Bell notifications whenever events fire.",
              ],
            ].map(([title, body]) => (
              <li key={title} className="panel flex items-start gap-2.5 p-3">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                <div>
                  <p className="font-bold text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs text-foreground/75">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-3">
            <div className="relative rounded-xl border border-primary/35 bg-[#08081A] p-4">
              <button
                type="button"
                onClick={() => void copyText(guideSnippets[guideTab], "Integration snippet")}
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold hover:border-lavender"
              >
                <Copy className="size-3" aria-hidden /> Copy
              </button>
              <pre className="overflow-x-auto pr-16 font-mono text-xs leading-relaxed text-lavender">
                <code>{guideSnippets[guideTab]}</code>
              </pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/docs#integrations" size="sm">
                Integrations Documentation <ArrowRight className="size-3.5" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/bots/new" variant="outline" size="sm">
                <Send className="size-3.5" aria-hidden /> Connect Telegram Bot
              </ButtonLink>
            </div>
          </div>
        </div>
      </Card>

      {/* Connect Outbound Channel Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Connect External Integration"
        icon={<IconTile size="md" tone="primary"><Plug /></IconTile>}
        className="max-w-lg"
      >
        <form onSubmit={handleCreateIntegration} className="mt-3 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Provider" htmlFor="int-provider">
              <Select
                id="int-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as "webhook" | "slack" | "discord")}
              >
                <option value="webhook">Custom HTTPS Webhook</option>
                <option value="slack">Slack Channel Webhook</option>
                <option value="discord">Discord Channel Webhook</option>
              </Select>
            </Field>
            <Field label="Display Name" htmlFor="int-name" required>
              <Input
                id="int-name"
                placeholder="Engineering Alerts"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="HTTPS Webhook URL" htmlFor="int-url" required hint={PROVIDER_LABELS[provider].hint}>
            <Input
              id="int-url"
              type="url"
              placeholder={PROVIDER_LABELS[provider].placeholder}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              required
            />
          </Field>

          {provider === "webhook" && (
            <Field label="Signing Secret (Optional)" htmlFor="int-secret" hint="Used to sign X-RelayNest-Signature; auto-generated if left blank.">
              <Input
                id="int-secret"
                placeholder="Optional custom HMAC secret"
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
              />
            </Field>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Subscribed Events <span className="text-bad">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INTEGRATION_EVENT_META.map((ev) => {
                const checked = events.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs transition",
                      checked ? "border-lavender bg-primary/15" : "border-border bg-surface-2/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(ev.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="font-semibold">{ev.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingInt}>{savingInt ? "Connecting..." : "Save & Connect"}</Button>
          </div>
        </form>
      </Modal>

      {/* Provision Incoming Webhook Modal */}
      <Modal
        open={hookModalOpen}
        onClose={() => setHookModalOpen(false)}
        title="Provision Incoming Webhook Trigger"
        icon={<IconTile size="md" tone="primary"><Webhook /></IconTile>}
      >
        <form onSubmit={handleProvisionWebhook} className="mt-3 space-y-4">
          <Field label="Target Automation Workflow" htmlFor="hook-wf" required hint="If this workflow already has an endpoint, provisioning rotates its signing secret.">
            <Select id="hook-wf" value={selectedWorkflowId} onChange={(e) => setSelectedWorkflowId(e.target.value)}>
              {data.workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.status})</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setHookModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={savingHook}>
              <RefreshCw className="size-3.5" aria-hidden /> {savingHook ? "Creating..." : "Generate Webhook"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* One-time Webhook Secret Reveal Modal */}
      <Modal
        open={Boolean(revealedHook)}
        onClose={() => setRevealedHook(null)}
        title="Incoming Webhook Ready"
        icon={<IconTile size="md" tone="success"><Webhook /></IconTile>}
        className="max-w-lg"
      >
        {revealedHook && (
          <div className="mt-2 space-y-3 text-xs">
            <p className="text-foreground/85">
              Save your one-time <strong>X-RelayNest-Secret</strong> for <strong>{revealedHook.workflowName}</strong>:
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-lavender/40 bg-[#08081A] p-3">
              <code className="flex-1 break-all font-mono text-lavender">{revealedHook.secret}</code>
              <Button size="sm" onClick={() => void copyText(revealedHook.secret, "Webhook secret")}>
                <Copy className="size-3.5" aria-hidden /> Copy
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" onClick={() => setRevealedHook(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
