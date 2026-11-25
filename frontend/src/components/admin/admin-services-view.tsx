"use client";

import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, Server, TriangleAlert, XCircle } from "lucide-react";
import * as React from "react";
import type { ServiceProbe } from "@backend/server/admin/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { api } from "@/lib/api-client";

const GROUPS: { key: ServiceProbe["group"]; title: string }[] = [
  { key: "core", title: "Core Runtime" },
  { key: "database", title: "Supabase & Vector DB" },
  { key: "ai", title: "AI Model Gateways" },
  { key: "integrations", title: "External Integrations" },
];

export function AdminServicesView({ initial }: { initial?: ServiceProbe[] }) {
  const [services, setServices] = React.useState<ServiceProbe[]>(initial ?? []);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const r = await api<ServiceProbe[]>("/api/admin/services");
    setBusy(false);
    setLoading(false);
    if (r.ok) setServices(r.data);
    else setError(r.message);
  }, []);

  React.useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  const up = services.filter((s) => s.status === "up").length;
  const down = services.filter((s) => s.status === "down").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Services &amp; API Keys Health</h1>
          <p className="text-sm text-muted">
            {loading ? "Running live service probes..." : `${up} operational · ${down} down · ${services.length - up - down} unconfigured`}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />Re-check All
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-bad">
          <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">Probing Supabase, AI gateways, Telegram, and integrations...</Card>
      ) : (
        GROUPS.map((g) => (
          <section key={g.key} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{g.title}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {services.filter((s) => s.group === g.key).map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <IconTile tone={s.status === "up" ? "success" : s.status === "down" ? "danger" : "neutral"} size="md">
                      {s.status === "up" ? <CheckCircle2 /> : s.status === "down" ? <XCircle /> : <TriangleAlert />}
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate font-bold">{s.name}</h3>
                        <Badge tone={s.status === "up" ? "success" : s.status === "down" ? "danger" : "warning"} className="capitalize">
                          {s.status === "up" ? "Operational" : s.status === "down" ? "Down" : "Not Set"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-foreground/80">{s.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                        {s.latencyMs !== null && <span className="inline-flex items-center gap-1"><Server className="size-3" />{s.latencyMs} ms</span>}
                        {s.keyMask && <span className="inline-flex items-center gap-1 font-mono"><KeyRound className="size-3" />{s.keyMask}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
