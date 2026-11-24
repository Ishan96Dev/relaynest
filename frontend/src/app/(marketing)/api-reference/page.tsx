import type { Metadata } from "next";
import { ArrowRight, BarChart3, Bot, Check, Code2, KeyRound, Lock, RefreshCw, Webhook, Workflow } from "lucide-react";
import { API_SCOPE_META } from "@backend/lib/api/openapi";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata: Metadata = {
  title: "Workspace API Overview",
  description: "Overview of RelayNest REST APIs, scoped API keys, signed webhooks, and in-app Swagger UI documentation.",
};

const RESOURCE_GROUPS = [
  {
    icon: Bot,
    title: "Bots & Two-Way Sync",
    endpoints: ["GET /api/v1/bots", "POST /api/v1/bots", "GET /api/v1/bots/{id}", "POST /api/v1/bots/{id}/sync"],
    summary: "Provision bots, inspect connected Telegram channels, trigger live two-way sync, and manage status.",
  },
  {
    icon: Workflow,
    title: "Workflows & Webhook Triggers",
    endpoints: ["GET /api/v1/workflows", "POST /api/webhooks/workflows/{endpointId}"],
    summary: "Inspect published automation flows and fire idempotent signed HTTPS webhook triggers from external apps.",
  },
  {
    icon: Webhook,
    title: "Outbound Channels & Telemetry",
    endpoints: ["GET /api/v1/integrations", "GET /api/v1/analytics"],
    summary: "Connect Slack, Discord, or custom HTTPS callbacks and read real-time message execution analytics.",
  },
] as const;

export default function ApiReferencePage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-surface/85 p-6 shadow-[0_0_80px_-28px_rgb(var(--rn-primary))] sm:p-10">
        <Badge tone="info" className="rounded-full px-3 py-1">
          <Code2 className="size-3.5" aria-hidden /> OpenAPI 3.1 · Authenticated In-App Swagger UI
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Programmatic RelayNest Workspace API
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/80">
          Connect your existing apps, CRMs, or CI pipelines to RelayNest with scoped production Bearer API keys, HMAC-SHA256 webhooks, and an interactive Swagger UI console available inside your signed-in workspace.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/login?next=/api-docs" size="md">
            <Lock className="size-4" aria-hidden /> Sign In to Open In-App Swagger UI <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/docs#api-integrations" variant="outline" size="md">
            Read API Documentation
          </ButtonLink>
          <ButtonLink href="/features#api-integrations" variant="outline" size="md">
            View Features
          </ButtonLink>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          [KeyRound, "Scoped Production API Keys", "Generate rnk_live_ credentials inside Settings -> API Keys. Only irreversible SHA-256 hashes are stored in Supabase."],
          [Webhook, "Incoming & Outbound Webhooks", "Trigger automations with signed POST payloads or forward Slack, Discord & custom HTTPS alerts automatically."],
          [BarChart3, "Live Usage Charts & Alerts", "Every Bearer call logs response status and latency into your 7-day request chart and Bell notification center."],
        ].map(([I, t, d]) => {
          const Icon = I as typeof KeyRound;
          return (
            <Card key={t as string} className="p-5">
              <IconTile tone="primary" size="md"><Icon /></IconTile>
              <h2 className="mt-3 text-base font-bold">{t as string}</h2>
              <p className="mt-1.5 text-sm text-foreground/75">{d as string}</p>
            </Card>
          );
        })}
      </div>

      {/* High-Level API Surface */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {RESOURCE_GROUPS.map((grp) => {
          const Icon = grp.icon;
          return (
            <Card key={grp.title} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center gap-3">
                  <IconTile tone="info" size="md"><Icon /></IconTile>
                  <h2 className="text-base font-bold">{grp.title}</h2>
                </div>
                <p className="mt-3 text-sm text-foreground/75">{grp.summary}</p>
              </div>
              <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
                {grp.endpoints.map((ep) => (
                  <li key={ep} className="rounded-lg bg-surface-2/80 px-2.5 py-1.5 font-mono text-xs text-lavender">
                    {ep}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {/* Permission Scopes & Sign-In Callout */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <h2 className="text-lg font-extrabold">Granular Permission Scopes</h2>
          <p className="mt-1 text-sm text-foreground/75">
            Every key you create inside the workspace restricts access strictly to the scopes you approve.
          </p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {API_SCOPE_META.map((s) => (
              <li key={s.id} className="panel flex items-start gap-2.5 p-3 text-xs">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                <div>
                  <p className="font-bold text-foreground">{s.label}</p>
                  <p className="mt-0.5 text-muted">{s.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col justify-between border-lavender/40 bg-gradient-to-br from-surface via-surface-2 to-primary/10 p-6">
          <div>
            <Badge tone="primary" className="rounded-full">Authenticated Workspace Console</Badge>
            <h2 className="mt-3 text-xl font-extrabold">Test Live Endpoints in Swagger UI</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              For security, RelayNest&apos;s interactive Swagger UI explorer and live request runner live inside your signed-in workspace sidebar (<code className="text-lavender">/api-docs</code>) alongside Settings -&gt; API Keys.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <ButtonLink href="/login?next=/api-docs" size="md">
              <RefreshCw className="size-4" aria-hidden /> Open Workspace Swagger UI
            </ButtonLink>
            <ButtonLink href="/signup" variant="outline" size="md">
              Create Free Account
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

