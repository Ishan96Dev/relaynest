"use client";

import { AlertCircle, RefreshCw, Search, Users } from "lucide-react";
import * as React from "react";
import type { AdminUserRecord } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

export function AdminUsersView({ initialUsers }: { initialUsers?: AdminUserRecord[] }) {
  const [users, setUsers] = React.useState<AdminUserRecord[]>(initialUsers ?? []);
  const [loading, setLoading] = React.useState(!initialUsers);
  const [q, setQ] = React.useState("");
  const [plan, setPlan] = React.useState("all");
  const [provider, setProvider] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (fresh = false) => {
    setBusy(true);
    setError(undefined);
    const r = await api<{ users: AdminUserRecord[] }>(fresh ? "/api/admin/users?fresh=1" : "/api/admin/users");
    setBusy(false);
    setLoading(false);
    if (r.ok) setUsers(r.data.users);
    else setError(r.message);
  }, []);

  React.useEffect(() => {
    if (!initialUsers) void load(false);
  }, [initialUsers, load]);

  const filtered = users.filter((u) => {
    if (plan !== "all" && u.plan !== plan) return false;
    if (provider !== "all" && u.provider !== provider) return false;
    if (!q) return true;
    return `${u.name} ${u.email} ${u.workspaceName ?? ""}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">User Records</h1>
          <p className="text-sm text-muted">
            Full directory of registered accounts, authentication providers, workspace roles, plans, bots, API keys, and integrations.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_160px]">
        <Input icon={<Search />} placeholder="Search name, email, or workspace..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
        </Select>
        <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="all">All Providers</option>
          <option value="email">Email</option>
          <option value="google">Google SSO</option>
        </Select>
      </div>

      <Card>
        <CardHeader title={`Registered Accounts (${filtered.length})`} icon={<Users />} tile />
        <div className="overflow-x-auto px-5 pb-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Loading user records...</p>
          ) : (
            <table className="rn-table min-w-[900px]">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Auth</th>
                  <th>Workspace &amp; Role</th>
                  <th>Plan</th>
                  <th>Bots / AI</th>
                  <th>API Keys / Intg</th>
                  <th>Last Sign-In</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td><Badge tone="neutral" className="capitalize">{u.provider}</Badge></td>
                    <td className="text-xs">
                      {u.workspaceName ?? "-"} {u.role && <span className="text-muted">({u.role})</span>}
                    </td>
                    <td><Badge tone={u.plan === "free" ? "neutral" : "success"} className="capitalize">{u.plan}</Badge></td>
                    <td className="tabular-nums text-xs">{u.botsCount} / {u.aiAgentsCount}</td>
                    <td className="tabular-nums text-xs">{u.apiKeysCount} / {u.integrationsCount}</td>
                    <td className="text-xs text-muted">{dt(u.lastSignInAt)}</td>
                    <td className="text-xs text-muted">{dt(u.createdAt)}</td>
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
