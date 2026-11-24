"use client";

import {
  Activity, BarChart3, BookOpen, Calendar, Check, CheckCircle2, Code2, Copy, Eye, EyeOff, KeyRound,
  Plus, RefreshCw, Shield, ShieldAlert, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { API_SCOPE_META, type ApiScope } from "@backend/lib/api/openapi";
import type { ApiKeyDto, ApiKeysPageData } from "@backend/server/services/api-keys";
import { TrendChart } from "@/components/charts/lazy-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageTitle } from "@/components/motion/split-text";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { label: "7 Days", value: "7" },
  { label: "30 Days", value: "30" },
  { label: "90 Days (Recommended)", value: "90" },
  { label: "1 Year", value: "365" },
  { label: "Never Expires", value: "never" },
] as const;

const BEST_PRACTICES = [
  "Never expose API keys inside client-side browser bundles or public GitHub repositories.",
  "Store tokens cleanly inside server `.env` files or Cloudflare Worker encrypted secrets.",
  "Grant only the minimum required permission scopes (Principle of Least Privilege).",
  "Rotate active integration keys every 90 days or immediately if suspicious requests appear.",
  "Inspect Live API Activity logs and Notification Bell alerts after creating or revoking keys.",
];

export function ApiKeysManager({ initialData, appUrl }: { initialData: ApiKeysPageData; appUrl: string }) {
  const [data, setData] = React.useState<ApiKeysPageData>(initialData);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "active" | "revoked">("all");
  const [codeLang, setCodeLang] = React.useState<"curl" | "node" | "python">("curl");

  // Create form state (Production rnk_live_ is always enforced by default)
  const [name, setName] = React.useState("");
  const [expires, setExpires] = React.useState<string>("90");
  const [scopes, setScopes] = React.useState<ApiScope[]>(["bots:read", "workflows:read", "analytics:read"]);

  // One-time revealed secret modal state
  const [revealedToken, setRevealedToken] = React.useState<{ name: string; token: string } | null>(null);
  const [tokenVisible, setTokenVisible] = React.useState(false);

  async function refresh() {
    const res = await api<ApiKeysPageData>("/api/v1/settings/api-keys");
    if (res.ok) setData(res.data);
  }

  function toggleScope(scope: ApiScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter a descriptive name for your API key.");
    if (scopes.length === 0) return toast.error("Select at least one permission scope.");
    setSubmitting(true);
    const res = await api<{ key: ApiKeyDto; plaintextToken: string }>("/api/v1/settings/api-keys", {
      body: {
        name: name.trim(),
        environment: "production",
        scopes,
        expiresInDays: expires === "never" ? null : Number(expires),
      },
    });
    setSubmitting(false);
    if (!res.ok) return toast.error(res.message);
    toast.success("API key created & saved to Supabase");
    setCreateOpen(false);
    setName("");
    setRevealedToken({ name: res.data.key.name, token: res.data.plaintextToken });
    setTokenVisible(false);
    await refresh();
  }

  async function handleRevokeOrRotate(id: string, action: "revoke" | "rotate") {
    setBusyId(id);
    const res = await api<{ key: ApiKeyDto; plaintextToken?: string }>(`/api/v1/settings/api-keys/${id}`, {
      method: "PATCH",
      body: { action },
    });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    if (action === "rotate" && res.data.plaintextToken) {
      toast.success("Key rotated — copy your new token below");
      setRevealedToken({ name: res.data.key.name, token: res.data.plaintextToken });
      setTokenVisible(false);
    } else {
      toast.success("API key revoked");
    }
    await refresh();
  }

  async function handleDelete(id: string, keyName: string) {
    setBusyId(id);
    const res = await api(`/api/v1/settings/api-keys/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) return toast.error(res.message);
    toast.success(`Removed "${keyName}"`);
    await refresh();
  }

  async function copyText(val: string, label: string) {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Clipboard copy unavailable — select and copy manually.");
    }
  }

  const visibleKeys = data.keys.filter((k) => (filter === "all" ? true : filter === "active" ? k.status === "active" : k.status !== "active"));
  const successRate = data.stats.totalRequests7d > 0
    ? `${Math.round((data.stats.successfulRequests7d / data.stats.totalRequests7d) * 100)}%`
    : "100%";

  const sampleTokenPlaceholder = revealedToken ? revealedToken.token : "rnk_live_YOUR_SECRET_API_KEY";
  const snippets = {
    curl: `curl -X GET "${appUrl}/api/v1/bots" \\\n  -H "Authorization: Bearer ${sampleTokenPlaceholder}" \\\n  -H "Content-Type: application/json"`,
    node: `const res = await fetch("${appUrl}/api/v1/bots", {\n  headers: {\n    Authorization: \`Bearer \${process.env.RELAYNEST_API_KEY}\`,\n    "Content-Type": "application/json",\n  },\n});\nconst { data, meta } = await res.json();\nconsole.log(data);`,
    python: `import os, requests\n\nres = requests.get(\n    "${appUrl}/api/v1/bots",\n    headers={"Authorization": f"Bearer {os.environ['RELAYNEST_API_KEY']}"},\n    timeout=15,\n)\nprint(res.json()["data"])`,
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconTile size="xl" className="rounded-full"><KeyRound /></IconTile>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="API Keys" /></h1>
            <p className="text-sm text-foreground/80">
              Generate scoped credentials in Supabase, call RelayNest REST APIs directly, and monitor live request telemetry.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/api-docs" variant="outline" size="md">
            <Code2 className="size-4" aria-hidden /> Open Swagger UI
          </ButtonLink>
          <Button onClick={() => setCreateOpen(true)} disabled={data.demo}>
            <Plus className="size-4" aria-hidden /> Create New API Key
          </Button>
        </div>
      </div>

      {data.demo && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warn">
          Sign in with Supabase configured to generate, persist, and authenticate live API keys.
        </div>
      )}

      {/* Resource & Documentation Links Strip */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <IconTile size="xl" tone="primary"><Code2 /></IconTile>
        <div className="min-w-[260px] flex-1 leading-tight">
          <p className="font-bold">Programmatic Workspace API &amp; Interactive Swagger UI</p>
          <p className="mt-1 text-sm text-foreground/75">
            Create an <code className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-lavender">rnk_live_...</code> key below, authorize inside Swagger UI, and test live endpoints against your workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Swagger UI Explorer", Code2, "/api-docs"],
            ["API Documentation", BookOpen, "/docs#api-integrations"],
          ].map(([label, IconComp, href]) => {
            const Icon = IconComp as typeof BookOpen;
            return (
              <Link
                key={String(label)}
                href={String(href)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-lavender/50 bg-primary/10 px-3 text-xs font-semibold transition hover:bg-primary/20"
              >
                <Icon className="size-4 text-lavender" aria-hidden />
                {String(label)}
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Live Supabase Stat Cards */}
      <Card>
        <CardHeader
          title="API Key Overview"
          description="Live workspace credential and telemetry counts."
          icon={<BarChart3 />}
          tile
          action={<Badge tone="success" dot>Supabase Connected</Badge>}
        />
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total API Keys" value={String(data.stats.totalKeys)} icon={<KeyRound />} tone="primary" subtle />
          <StatCard label="Active Keys" value={String(data.stats.activeKeys)} icon={<CheckCircle2 />} tone="success" subtle />
          <StatCard label="Revoked Keys" value={String(data.stats.revokedKeys)} icon={<X />} tone="danger" subtle />
          <StatCard
            label="Last API Request"
            value={data.stats.lastRequestAt ? new Date(data.stats.lastRequestAt).toLocaleString() : "No calls yet"}
            icon={<Calendar />}
            tone="primary"
            subtle
          />
        </div>
      </Card>

      {/* API Keys Table */}
      <Card>
        <CardHeader
          title="Workspace API Keys"
          description="Secrets are stored strictly as SHA-256 hashes; only key prefixes appear after creation."
          icon={<KeyRound />}
          tile
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border/80 bg-surface-2/80 p-0.5 text-xs">
                {(["all", "active", "revoked"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-semibold capitalize transition",
                      filter === tab ? "bg-primary text-white" : "text-muted hover:text-foreground",
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={data.demo}>
                <Plus className="size-3.5" aria-hidden /> New Key
              </Button>
            </div>
          }
        />

        <div className="overflow-x-auto px-5 pb-5">
          {visibleKeys.length === 0 ? (
            <div className="panel flex flex-col items-center justify-center gap-3 py-10 text-center">
              <KeyRound className="size-8 text-lavender" aria-hidden />
              <div>
                <p className="font-bold">No {filter !== "all" ? filter : ""} API keys yet</p>
                <p className="mt-1 text-sm text-muted">
                  Create your first API key to call bots, workflows, integrations, or analytics endpoints programmatically.
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={data.demo}>
                <Plus className="size-3.5" aria-hidden /> Generate First API Key
              </Button>
            </div>
          ) : (
            <table className="rn-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Key Prefix</th>
                  <th>Scopes</th>
                  <th>Requests</th>
                  <th>Last Used</th>
                  <th>Expiration</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-semibold">{k.name}</td>
                    <td>
                      <code className="rounded border border-lavender/50 bg-primary/10 px-2 py-0.5 text-xs">
                        {k.keyPrefix}&bull;&bull;&bull;
                      </code>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.slice(0, 2).map((s) => (
                          <Badge key={s} tone="neutral" className="font-normal">{s}</Badge>
                        ))}
                        {k.scopes.length > 2 && (
                          <Badge tone="neutral" className="font-normal">+{k.scopes.length - 2}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{k.requestCount}</td>
                    <td className="text-xs text-foreground/80">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                    </td>
                    <td className="text-xs text-foreground/80">
                      {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                    </td>
                    <td>
                      <Badge tone={k.status === "active" ? "success" : k.status === "revoked" ? "danger" : "neutral"} dot>
                        {k.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {k.status === "active" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === k.id}
                              onClick={() => void handleRevokeOrRotate(k.id, "rotate")}
                              title="Generate replacement key and revoke this one"
                            >
                              <RefreshCw className="size-3.5" aria-hidden /> Rotate
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-outline"
                              disabled={busyId === k.id}
                              onClick={() => void handleRevokeOrRotate(k.id, "revoke")}
                              title="Immediately disable this key"
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === k.id}
                          onClick={() => void handleDelete(k.id, k.name)}
                          aria-label={`Delete API key ${k.name}`}
                          title="Delete record"
                        >
                          <Trash2 className="size-3.5 text-bad" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Usage Telemetry & Live Activity */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="API Request Volume (Last 7 Days)" description="Requests authenticated via your workspace API keys." icon={<BarChart3 />} tile />
          <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3">
            <div className="panel p-3"><p className="text-xs text-muted">7-Day Requests</p><p className="mt-0.5 text-lg font-extrabold">{data.stats.totalRequests7d}</p></div>
            <div className="panel p-3"><p className="text-xs text-muted">Success Rate</p><p className="mt-0.5 text-lg font-extrabold text-ok">{successRate}</p></div>
            <div className="panel p-3"><p className="text-xs text-muted">Errors (4xx/5xx)</p><p className="mt-0.5 text-lg font-extrabold text-bad">{data.stats.failedRequests7d}</p></div>
          </div>
          <div className="px-3 pb-4 pt-3">
            <TrendChart data={data.usage7d} id="api-live" label="API requests over the last 7 days" height={190} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent API Activity" description="Real requests logged from external clients & Swagger UI." icon={<Activity />} tile />
          {data.recentLogs.length === 0 ? (
            <div className="px-5 pb-6 text-sm text-muted">
              No external API calls logged in the last 7 days yet. Copy the cURL snippet below or execute any endpoint in{" "}
              <Link href="/api-docs" className="font-semibold text-lavender hover:underline">Swagger UI</Link> using your key.
            </div>
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {data.recentLogs.map((log) => (
                <li key={log.id} className="flex items-center gap-2.5 text-xs">
                  <span className={cn("size-2 shrink-0 rounded-full", log.statusCode < 400 ? "bg-success" : "bg-danger")} aria-hidden />
                  <Badge tone={log.method === "GET" ? "info" : log.method === "DELETE" ? "danger" : "success"} className="w-14 justify-center">
                    {log.method}
                  </Badge>
                  <code className="flex-1 truncate font-mono">{log.path}</code>
                  <Badge tone={log.statusCode < 400 ? "success" : "danger"}>{log.statusCode}</Badge>
                  <span className="w-12 text-right font-mono text-muted">{log.latencyMs}ms</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Step-by-Step How to Integrate API Guide & Security */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader
            title="How to Integrate Your API Key"
            description="Authenticate external backends, CRMs, or scripts against RelayNest REST APIs."
            icon={<Code2 />}
            tile
            action={
              <div className="inline-flex rounded-lg border border-border/80 bg-surface-2/80 p-0.5 text-xs">
                {(["curl", "node", "python"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setCodeLang(lang)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-semibold uppercase transition",
                      codeLang === lang ? "bg-primary text-white" : "text-muted hover:text-foreground",
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            }
          />
          <div className="space-y-4 px-5 pb-5">
            <div className="relative rounded-xl border border-primary/35 bg-[#08081A] p-4">
              <button
                type="button"
                onClick={() => void copyText(snippets[codeLang], `${codeLang.toUpperCase()} example`)}
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-lavender"
              >
                <Copy className="size-3" aria-hidden /> Copy
              </button>
              <pre className="overflow-x-auto pr-16 font-mono text-xs leading-relaxed text-lavender">
                <code>{snippets[codeLang]}</code>
              </pre>
            </div>
            <ol className="grid gap-2 text-xs text-foreground/80 sm:grid-cols-2">
              <li className="panel p-3"><span className="font-bold text-lavender">1. Generate Scoped Token:</span> Pick an expiration window, name your key, and tick minimum scopes.</li>
              <li className="panel p-3"><span className="font-bold text-lavender">2. Pass Bearer Header:</span> Send <code className="text-foreground">Authorization: Bearer rnk_live_...</code> over HTTPS.</li>
              <li className="panel p-3"><span className="font-bold text-lavender">3. Test in Swagger UI:</span> Authorize live inside <Link href="/api-docs" className="text-lavender underline">API &amp; Swagger UI</Link> before shipping code.</li>
              <li className="panel p-3"><span className="font-bold text-lavender">4. Track Logs &amp; Bell Alerts:</span> Every creation, revocation, and call logs automatically.</li>
            </ol>
          </div>
        </Card>

        <Card>
          <CardHeader title="API Security Best Practices" description="Keep workspace credentials protected in production." icon={<Shield />} tile />
          <div className="space-y-4 px-5 pb-5">
            <ul className="space-y-2.5">
              {BEST_PRACTICES.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Create API Key Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New API Key"
        icon={<IconTile size="md" tone="primary"><KeyRound /></IconTile>}
        className="max-w-lg"
      >
        <form onSubmit={handleCreate} className="mt-3 space-y-4">
          <Field label="Key Name" htmlFor="api-key-name" required hint="e.g., CRM Sync Backend or CI Pipeline">
            <Input
              id="api-key-name"
              placeholder="Production Automation Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">
              Expiration <span className="ml-1.5 text-xs font-normal text-muted">(Production · rnk_live_)</span>
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="API Key Expiration">
              {EXPIRY_OPTIONS.map((o) => {
                const active = expires === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setExpires(o.value)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                      active
                        ? "border-lavender bg-primary/20 text-white shadow-[0_0_0_1px_rgb(var(--rn-lavender)/0.45)]"
                        : "border-border bg-surface-2/70 text-foreground/80 hover:border-lavender/50 hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Permissions (Scopes) <span className="text-bad">*</span></legend>
            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {API_SCOPE_META.map((s) => {
                const checked = scopes.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-xs transition",
                      checked ? "border-lavender bg-primary/15" : "border-border bg-surface-2/60 hover:border-lavender/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(s.id)}
                      className="mt-0.5 size-3.5 accent-primary"
                    />
                    <span className="min-w-0 leading-snug">
                      <span className="block font-bold text-foreground">{s.label}</span>
                      <span className="text-[11px] text-muted">{s.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Generating..." : "Generate API Key"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* One-Time Plaintext Secret Reveal Modal */}
      <Modal
        open={Boolean(revealedToken)}
        onClose={() => setRevealedToken(null)}
        title="Copy Your New API Key"
        icon={<IconTile size="md" tone="warning"><ShieldAlert /></IconTile>}
        className="max-w-lg"
      >
        {revealedToken && (
          <div className="mt-2 space-y-4">
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warn">
              This is the <strong>only time</strong> RelayNest will display your plaintext secret key for{" "}
              <strong>{revealedToken.name}</strong>. Store it safely now.
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-lavender/40 bg-[#08081A] p-3">
              <code className="flex-1 break-all font-mono text-xs text-lavender">
                {tokenVisible ? revealedToken.token : `${revealedToken.token.slice(0, 17)}${"•".repeat(20)}`}
              </code>
              <button
                type="button"
                aria-label={tokenVisible ? "Hide token" : "Show token"}
                onClick={() => setTokenVisible((v) => !v)}
                className="rounded-md p-1.5 text-muted hover:bg-foreground/10 hover:text-foreground"
              >
                {tokenVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <Button size="sm" onClick={() => void copyText(revealedToken.token, "API key")}>
                <Copy className="size-3.5" aria-hidden /> Copy
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ButtonLink href="/api-reference" variant="outline" size="sm" onClick={() => setRevealedToken(null)}>
                Test in Swagger UI
              </ButtonLink>
              <Button size="sm" onClick={() => setRevealedToken(null)}>I&apos;ve Saved This Key</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
