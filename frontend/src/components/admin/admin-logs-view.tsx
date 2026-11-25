"use client";

import { AlertCircle, RefreshCw, Search, Trash2 } from "lucide-react";
import * as React from "react";
import type { ConsoleLogEntry } from "@backend/server/logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SECTIONS = [
  ["all", "All Logs"],
  ["frontend", "Frontend"],
  ["backend", "Backend"],
  ["api", "API"],
  ["db", "Database"],
  ["auth", "Auth"],
  ["llm", "LLM"],
  ["vector", "Vector DB"],
  ["queue", "Kafka & Redis"],
] as const;

export function AdminLogsView({ initial }: { initial?: ConsoleLogEntry[] }) {
  const [entries, setEntries] = React.useState<ConsoleLogEntry[]>(initial ?? []);
  const [loading, setLoading] = React.useState(!initial);
  const [section, setSection] = React.useState<string>("all");
  const [level, setLevel] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const [auto, setAuto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const r = await api<{ entries: ConsoleLogEntry[] }>(`/api/admin/logs?section=${section}&level=${level}`);
    setBusy(false);
    setLoading(false);
    if (r.ok) setEntries(r.data.entries);
    else setError(r.message);
  }, [section, level]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [auto, load]);

  async function clear() {
    await api("/api/admin/logs", { method: "DELETE" });
    void load();
  }

  const shown = entries.filter((e) => !q || `${e.section} ${e.message} ${JSON.stringify(e.meta ?? "")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Console Logs</h1>
          <p className="text-sm text-muted">Live runtime logs and persisted DB telemetry grouped by subsystem.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={auto ? "primary" : "outline"} size="sm" onClick={() => setAuto((a) => !a)}>
            {auto ? "Live (10s)" : "Auto-Refresh Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />Refresh
          </Button>
          <Button variant="danger-outline" size="sm" onClick={() => void clear()}>
            <Trash2 className="size-3.5" />Clear Buffer
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-bad">
          <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSection(id)}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", section === id ? "btn-primary-bg text-white" : "text-muted hover:bg-foreground/5 hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
        <Input icon={<Search />} placeholder="Search log messages..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[640px] divide-y divide-border/50 overflow-y-auto font-mono text-xs">
          {loading ? (
            <p className="p-8 text-center font-sans text-sm text-muted">Loading console logs...</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center font-sans text-sm text-muted">No logs in this section yet.</p>
          ) : (
            shown.map((e) => (
              <div key={e.id} className="flex flex-wrap items-start gap-2.5 px-4 py-2.5 hover:bg-foreground/[0.03]">
                <span className="shrink-0 text-muted">{new Date(e.ts).toLocaleTimeString()}</span>
                <Badge tone={e.level === "error" ? "danger" : e.level === "warn" ? "warning" : "info"} className="uppercase">{e.level}</Badge>
                <Badge tone="neutral" className="uppercase">{e.section}</Badge>
                <span className="min-w-0 flex-1 break-all text-foreground/90">{e.message}</span>
                {e.meta && <span className="text-muted">{JSON.stringify(e.meta)}</span>}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
