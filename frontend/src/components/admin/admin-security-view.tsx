"use client";

import { CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import * as React from "react";
import type { AdminSecurityControl, AdminSecurityWarningItem } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface SecurityData {
  controls: AdminSecurityControl[];
  warnings: AdminSecurityWarningItem[];
}

export function AdminSecurityView({ initial }: { initial: SecurityData }) {
  const [data, setData] = React.useState(initial);
  const [sev, setSev] = React.useState<"all" | "critical" | "warning" | "info">("all");
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    setBusy(true);
    const r = await api<SecurityData>("/api/admin/security");
    setBusy(false);
    if (r.ok) setData(r.data);
  }

  const shownWarnings = data.warnings.filter((w) => (sev === "all" ? true : w.severity === sev));
  const critCount = data.warnings.filter((w) => w.severity === "critical").length;
  const warnCount = data.warnings.filter((w) => w.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Security &amp; Warnings</h1>
          <p className="text-sm text-muted">
            Live CyberSecurity defense posture, password hashing &amp; phishing safeguards, API rate-limit triggers, and warning events.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden /> Refresh
        </Button>
      </div>

      {/* Defense Controls Scorecard */}
      <Card>
        <CardHeader
          title="CyberSecurity Controls Matrix"
          description={`${data.controls.filter((c) => c.status === "enforced").length}/${data.controls.length} hardened controls actively enforced.`}
          icon={<ShieldCheck />}
          tile
        />
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
          {data.controls.map((c) => (
            <div key={c.id} className="panel flex items-start gap-3 p-3.5">
              <IconTile tone={c.status === "enforced" ? "success" : "warning"} size="md">
                {c.status === "enforced" ? <CheckCircle2 /> : <TriangleAlert />}
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{c.title}</p>
                  <Badge tone={c.status === "enforced" ? "success" : "warning"}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-foreground/75">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Security Warnings Feed */}
      <Card>
        <CardHeader
          title={`Security Events & Warnings (${shownWarnings.length})`}
          description={`${critCount} critical · ${warnCount} warning events detected.`}
          icon={<ShieldAlert />}
          tile
          action={
            <div className="inline-flex rounded-lg border border-border/80 bg-surface-2/80 p-0.5 text-xs">
              {(["all", "critical", "warning", "info"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSev(tab)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold capitalize transition",
                    sev === tab ? "bg-primary text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto px-5 pb-5">
          {shownWarnings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No security warnings match this severity filter.</p>
          ) : (
            <table className="rn-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Event</th>
                  <th>Detail</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {shownWarnings.map((w) => (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{new Date(w.ts).toLocaleString()}</td>
                    <td>
                      <Badge tone={w.severity === "critical" ? "danger" : w.severity === "warning" ? "warning" : "info"}>
                        {w.severity}
                      </Badge>
                    </td>
                    <td className="text-xs font-semibold">{w.source}</td>
                    <td className="text-xs font-bold">{w.title}</td>
                    <td className="max-w-sm break-words text-xs text-foreground/80">{w.detail}</td>
                    <td className="text-xs text-muted">{w.actor ?? "-"}</td>
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
