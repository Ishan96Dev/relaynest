"use client";

import { Activity, AlertCircle, KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import * as React from "react";
import type { AdminKeyInventoryItem, AdminPlatformCredentialItem } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { api } from "@/lib/api-client";

interface KeysData {
  platformCredentials: AdminPlatformCredentialItem[];
  workspaceKeys: AdminKeyInventoryItem[];
  recentApiCalls: Array<{ id: string; workspaceName: string; method: string; path: string; statusCode: number; latencyMs: number; createdAt: string }>;
}

const EMPTY_KEYS: KeysData = { platformCredentials: [], workspaceKeys: [], recentApiCalls: [] };

export function AdminKeysView({ initial }: { initial?: KeysData }) {
  const [data, setData] = React.useState<KeysData>(initial ?? EMPTY_KEYS);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const r = await api<KeysData>("/api/admin/keys");
    setBusy(false);
    setLoading(false);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);

  React.useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Keys &amp; Workspace API Credentials</h1>
          <p className="text-sm text-muted">
            Masked platform secrets readiness plus cross-workspace API keys inventory and live request metrics.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden /> Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-bad">
          <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {/* Platform Secrets */}
      <Card>
        <CardHeader title="Platform Environment Credentials" description="Full secrets remain strictly server-only; only prefixes are shown." icon={<Lock />} tile />
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
          {loading ? (
            <p className="py-4 text-sm text-muted">Loading credentials readiness...</p>
          ) : (
            data.platformCredentials.map((c) => (
              <div key={c.envKey} className="panel flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{c.label}</p>
                  <p className="font-mono text-[11px] text-lavender">{c.envKey}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.note}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={c.configured ? "success" : "warning"}>{c.configured ? "Configured" : "Not Set"}</Badge>
                  {c.maskedPreview && <p className="mt-1 font-mono text-[11px] text-muted">{c.maskedPreview}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Workspace User API Keys */}
      <Card>
        <CardHeader title={`Workspace Issued API Keys (${data.workspaceKeys.length})`} description="Hashed with SHA-256 in Supabase api_keys." icon={<KeyRound />} tile />
        <div className="overflow-x-auto px-5 pb-5">
          {loading ? (
            <p className="text-sm text-muted">Loading workspace keys...</p>
          ) : data.workspaceKeys.length === 0 ? (
            <p className="text-sm text-muted">No workspace API keys currently exist in Supabase.</p>
          ) : (
            <table className="rn-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Workspace</th>
                  <th>Env</th>
                  <th>Scopes</th>
                  <th>Requests</th>
                  <th>Status</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {data.workspaceKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-semibold">{k.name}</td>
                    <td><code className="font-mono text-xs text-lavender">{k.keyPrefix}•••</code></td>
                    <td className="text-xs">{k.workspaceName}</td>
                    <td><Badge tone={k.environment === "production" ? "success" : "info"}>{k.environment}</Badge></td>
                    <td className="text-xs">{k.scopes.join(", ")}</td>
                    <td className="font-mono text-xs">{k.requestCount}</td>
                    <td><Badge tone={k.status === "active" ? "success" : "danger"} dot>{k.status}</Badge></td>
                    <td className="text-xs text-muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Recent Cross-Workspace API Telemetry */}
      <Card>
        <CardHeader title="Recent Bearer API Calls" icon={<Activity />} tile />
        <div className="px-5 pb-5">
          {loading ? (
            <p className="text-sm text-muted">Loading recent API calls...</p>
          ) : data.recentApiCalls.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <IconTile tone="info" size="sm"><ShieldCheck /></IconTile>
              <span>No Bearer API requests logged yet.</span>
            </div>
          ) : (
            <ul className="divide-y divide-border/50 text-xs">
              {data.recentApiCalls.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <Badge tone={c.method === "GET" ? "info" : "success"} className="w-14 justify-center">{c.method}</Badge>
                  <code className="flex-1 truncate font-mono">{c.path}</code>
                  <span className="text-muted">{c.workspaceName}</span>
                  <Badge tone={c.statusCode < 400 ? "success" : "danger"}>{c.statusCode}</Badge>
                  <span className="font-mono text-muted">{c.latencyMs}ms</span>
                  <span className="text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
