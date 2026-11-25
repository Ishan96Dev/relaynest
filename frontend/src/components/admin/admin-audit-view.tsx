"use client";

import { Activity, AlertCircle, RefreshCw, Search } from "lucide-react";
import * as React from "react";
import type { AuditMovement } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

interface AuditData {
  movements: AuditMovement[];
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

export function AdminAuditView({ initial }: { initial?: AuditData }) {
  const [data, setData] = React.useState<AuditData>(initial ?? { movements: [] });
  const [loading, setLoading] = React.useState(!initial);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (fresh = false) => {
    setBusy(true);
    setError(undefined);
    const r = await api<AuditData>(fresh ? "/api/admin/audit?fresh=1" : "/api/admin/audit");
    setBusy(false);
    setLoading(false);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);

  React.useEffect(() => {
    if (!initial) void load(false);
  }, [initial, load]);

  const movements = data.movements.filter(
    (m) =>
      (cat === "all" || m.category === cat) &&
      (!q || `${m.actor} ${m.workspace} ${m.action} ${m.detail}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Audit Trail</h1>
          <p className="text-sm text-muted">
            Detailed multi-tenant movement log across authentication, bots, API keys, webhooks, billing, and security.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
        <Input
          icon={<Search />}
          placeholder="Search actor email, workspace, IP, action, or detail..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="security">Security Events</option>
          <option value="user_event">Logins &amp; Page Views</option>
          <option value="api_key">API Keys &amp; REST Traffic</option>
          <option value="integration">Integrations &amp; Webhooks</option>
          <option value="activity">Workspace Actions</option>
          <option value="execution">Workflow Executions</option>
          <option value="payment">Billing / Payments</option>
          <option value="ai">AI Model Usage</option>
          <option value="notification">Notifications</option>
        </Select>
      </div>

      <Card>
        <CardHeader title={`Platform Audit Movements (${movements.length})`} icon={<Activity />} tile />
        <div className="overflow-x-auto px-5 pb-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Loading audit trail...</p>
          ) : (
            <table className="rn-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Category</th>
                  <th>User</th>
                  <th>Workspace</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{dt(m.ts)}</td>
                    <td>
                      <Badge
                        tone={
                          m.category === "security"
                            ? "danger"
                            : m.category === "payment" || m.category === "api_key"
                              ? "success"
                              : m.category === "execution" || m.category === "integration"
                                ? "info"
                                : "neutral"
                        }
                        className="capitalize"
                      >
                        {m.category.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="text-xs">{m.actor}</td>
                    <td className="text-xs">{m.workspace}</td>
                    <td className="font-mono text-xs text-lavender">{m.action}</td>
                    <td className="max-w-sm break-words text-xs text-foreground/85">{m.detail || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
