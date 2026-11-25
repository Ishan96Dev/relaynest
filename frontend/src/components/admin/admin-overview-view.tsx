"use client";

import {
  Activity, AlertCircle, ArrowRight, Bot, BrainCircuit, Building2, KeyRound, Plug, RefreshCw, Server,
  ShieldAlert, Terminal, Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { AdminAuditData } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { api } from "@/lib/api-client";

const EMPTY_DATA: AdminAuditData = {
  totals: { users: 0, workspaces: 0, bots: 0, aiAgents: 0, apiKeys: 0, integrations: 0, securityAlerts: 0 },
  users: [],
  movements: [],
};

const SUBPAGES = [
  { href: "/admin/audit", title: "Audit Trail", desc: "Full cross-tenant timeline of logins, bots, billing, API calls & integrations.", icon: Activity },
  { href: "/admin/users", title: "User Records", desc: "Directory of all workspace accounts, plans, providers & resource counts.", icon: Users },
  { href: "/admin/services", title: "Services Health", desc: "Live latency probes for Supabase, Redis, Kafka, AI gateways & Telegram.", icon: Server },
  { href: "/admin/keys", title: "Keys & Tokens", desc: "Masked platform environment keys plus workspace API keys & telemetry.", icon: KeyRound },
  { href: "/admin/logs", title: "Console Logs", desc: "Real-time server log stream & persisted subsystem diagnostics.", icon: Terminal },
  { href: "/admin/security", title: "Security & Warnings", desc: "CyberSecurity posture controls, brute-force locks, 429s & warning alerts.", icon: ShieldAlert },
];

export function AdminOverviewView({ initial }: { initial?: AdminAuditData }) {
  const [data, setData] = React.useState<AdminAuditData>(initial ?? EMPTY_DATA);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (fresh = false) => {
    setBusy(true);
    setError(undefined);
    const r = await api<AdminAuditData>(fresh ? "/api/admin/overview?fresh=1" : "/api/admin/overview");
    setBusy(false);
    setLoading(false);
    if (r.ok) {
      setData(r.data);
    } else {
      setError(r.message);
    }
  }, []);

  React.useEffect(() => {
    if (!initial) void load(false);
  }, [initial, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Platform Admin Overview</h1>
          <p className="text-sm text-muted">
            Monitor accounts, audit events, API keys, service health, runtime logs, and cybersecurity posture.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={busy}>
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden /> Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-bad">
          <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load(true)}>Retry</Button>
        </div>
      )}

      {/* Totals Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {[
          { label: "Users", value: data.totals.users, icon: Users, tone: "primary" as const },
          { label: "Workspaces", value: data.totals.workspaces, icon: Building2, tone: "info" as const },
          { label: "Bots", value: data.totals.bots, icon: Bot, tone: "success" as const },
          { label: "AI Agents", value: data.totals.aiAgents, icon: BrainCircuit, tone: "primary" as const },
          { label: "API Keys", value: data.totals.apiKeys, icon: KeyRound, tone: "info" as const },
          { label: "Integrations", value: data.totals.integrations, icon: Plug, tone: "success" as const },
          { label: "Sec. Alerts", value: data.totals.securityAlerts, icon: ShieldAlert, tone: (data.totals.securityAlerts > 0 ? "danger" : "success") as "danger" | "success" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card flex items-center gap-3 p-3.5">
              <IconTile tone={item.tone} size="md"><Icon /></IconTile>
              <div>
                <p className="text-[11px] text-muted">{item.label}</p>
                <p className="text-xl font-extrabold">{loading ? "…" : item.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dedicated Subpages Directory */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SUBPAGES.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} prefetch={false} className="group">
              <Card className="h-full p-5 transition group-hover:border-lavender/60">
                <div className="flex items-start justify-between gap-3">
                  <IconTile tone="primary" size="md"><Icon /></IconTile>
                  <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-lavender" aria-hidden />
                </div>
                <h2 className="mt-3 text-base font-bold group-hover:text-lavender">{s.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-foreground/75">{s.desc}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Latest Snapshots */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent Audit Trail"
            description="Latest 6 events across the platform."
            icon={<Activity />}
            tile
            action={<Link href="/admin/audit" prefetch={false} className="text-xs font-semibold text-lavender hover:underline">Full Audit Trail &rarr;</Link>}
          />
          <ul className="divide-y divide-border/50 px-5 pb-4 text-xs">
            {loading ? (
              <li className="py-6 text-center text-muted">Loading recent audit events...</li>
            ) : data.movements.length === 0 ? (
              <li className="py-6 text-center text-muted">No recent audit events recorded yet.</li>
            ) : (
              data.movements.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-lavender">{m.action}</p>
                    <p className="truncate text-muted">{m.actor} · {m.workspace}</p>
                  </div>
                  <Badge tone={m.category === "security" ? "danger" : "neutral"} className="shrink-0 capitalize">
                    {m.category.replace("_", " ")}
                  </Badge>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Latest Workspace Accounts"
            description="Recently active or signed-up accounts."
            icon={<Users />}
            tile
            action={<Link href="/admin/users" prefetch={false} className="text-xs font-semibold text-lavender hover:underline">All Users &rarr;</Link>}
          />
          <ul className="divide-y divide-border/50 px-5 pb-4 text-xs">
            {loading ? (
              <li className="py-6 text-center text-muted">Loading workspace accounts...</li>
            ) : data.users.length === 0 ? (
              <li className="py-6 text-center text-muted">No registered workspace accounts yet.</li>
            ) : (
              data.users.slice(0, 6).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.name} <span className="font-normal text-muted">({u.email})</span></p>
                    <p className="truncate text-muted">{u.workspaceName ?? "No workspace"} · {u.botsCount} bots · {u.apiKeysCount} API keys</p>
                  </div>
                  <Badge tone={u.plan === "free" ? "neutral" : "success"} className="capitalize">{u.plan}</Badge>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
