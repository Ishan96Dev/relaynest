"use client";

import {
  CheckCircle2, ChevronDown, ChevronRight, Code2, Copy, Download, Eye, EyeOff, KeyRound, Lock,
  Play, Search, ShieldCheck, Terminal, Unlock,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { buildOpenApiSpec } from "@backend/lib/api/openapi";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;

interface EndpointItem {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  tag: string;
  summary: string;
  description: string;
  scope?: string;
  parameters: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: { type?: string; default?: string | number } }>;
  requestExample?: unknown;
  sampleResponse?: unknown;
  requiresAuth: boolean;
}

const METHOD_TONE: Record<EndpointItem["method"], "info" | "success" | "warning" | "danger"> = {
  GET: "info",
  POST: "success",
  PATCH: "warning",
  DELETE: "danger",
};

function flattenSpec(spec: OpenApiSpec): EndpointItem[] {
  const out: EndpointItem[] = [];
  for (const [pathKey, methods] of Object.entries(spec.paths)) {
    for (const [m, rawOp] of Object.entries(methods as Record<string, Record<string, unknown>>)) {
      const method = m.toUpperCase() as EndpointItem["method"];
      const tags = (rawOp.tags as string[] | undefined) ?? ["General"];
      const reqContent = (rawOp.requestBody as { content?: { "application/json"?: { example?: unknown } } } | undefined)?.content?.["application/json"]?.example;
      out.push({
        id: `${method}-${pathKey}`,
        method,
        path: pathKey,
        tag: tags[0] ?? "General",
        summary: String(rawOp.summary ?? ""),
        description: String(rawOp.description ?? ""),
        scope: rawOp["x-scope"] ? String(rawOp["x-scope"]) : undefined,
        parameters: ((rawOp.parameters as EndpointItem["parameters"] | undefined) ?? []),
        requestExample: reqContent,
        sampleResponse: rawOp["x-sample-response"],
        requiresAuth: !(Array.isArray(rawOp.security) && rawOp.security.length === 0),
      });
    }
  }
  return out;
}

export function SwaggerExplorer({ initialSpec }: { initialSpec: OpenApiSpec }) {
  const [spec, setSpec] = React.useState<OpenApiSpec>(initialSpec);
  const [origin, setOrigin] = React.useState(initialSpec.servers[0]?.url ?? "");
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [authorizedKey, setAuthorizedKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [authModalOpen, setAuthModalOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState("All");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ "GET-/api/v1/bots": true });

  // Per-endpoint live state
  const [paramValues, setParamValues] = React.useState<Record<string, Record<string, string>>>({});
  const [bodyValues, setBodyValues] = React.useState<Record<string, string>>({});
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, { status: number; latencyMs: number; body: string; ok: boolean }>>({});

  React.useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/v1/openapi.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s?.openapi) setSpec(s as OpenApiSpec); })
      .catch(() => undefined);
  }, []);

  const endpoints = React.useMemo(() => flattenSpec(spec), [spec]);
  const tags = React.useMemo(() => ["All", ...new Set(endpoints.map((e) => e.tag))], [endpoints]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return endpoints.filter((e) => {
      if (activeTag !== "All" && e.tag !== activeTag) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q)
      );
    });
  }, [endpoints, activeTag, query]);

  function getParam(epId: string, name: string, fallback = "") {
    return paramValues[epId]?.[name] ?? fallback;
  }

  function setParam(epId: string, name: string, val: string) {
    setParamValues((prev) => ({ ...prev, [epId]: { ...(prev[epId] ?? {}), [name]: val } }));
  }

  function buildResolvedUrl(ep: EndpointItem) {
    let urlPath = ep.path;
    const qs = new URLSearchParams();
    for (const p of ep.parameters) {
      const val = getParam(ep.id, p.name, p.schema?.default !== undefined ? String(p.schema.default) : "");
      if (p.in === "path") {
        urlPath = urlPath.replace(`{${p.name}}`, encodeURIComponent(val || `:${p.name}`));
      } else if (p.in === "query" && val.trim()) {
        qs.set(p.name, val.trim());
      }
    }
    const qStr = qs.toString();
    return `${urlPath}${qStr ? `?${qStr}` : ""}`;
  }

  async function executeEndpoint(ep: EndpointItem) {
    const resolved = buildResolvedUrl(ep);
    if (/:\w+/.test(resolved)) {
      toast.error("Fill in required path parameter(s) before executing.");
      return;
    }
    const rawBody = bodyValues[ep.id] ?? (ep.requestExample ? JSON.stringify(ep.requestExample, null, 2) : "");
    if (ep.method !== "GET" && ep.method !== "DELETE" && rawBody.trim()) {
      try {
        JSON.parse(rawBody);
      } catch {
        toast.error("Request body must be valid JSON.");
        return;
      }
    }

    setRunningId(ep.id);
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (authorizedKey.trim() && ep.requiresAuth) {
        headers.Authorization = `Bearer ${authorizedKey.trim()}`;
      }
      if (ep.method !== "GET" && ep.method !== "DELETE" && rawBody.trim()) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(resolved, {
        method: ep.method,
        headers,
        body: ep.method !== "GET" && ep.method !== "DELETE" && rawBody.trim() ? rawBody : undefined,
      });
      const text = await res.text();
      let formatted = text || "(empty response body)";
      try {
        if (text) formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch { /* non-JSON body */ }
      setResults((prev) => ({
        ...prev,
        [ep.id]: {
          status: res.status,
          latencyMs: Math.round(performance.now() - started),
          body: formatted,
          ok: res.ok,
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [ep.id]: {
          status: 0,
          latencyMs: Math.round(performance.now() - started),
          body: JSON.stringify({ error: e instanceof Error ? e.message : "Network error" }, null, 2),
          ok: false,
        },
      }));
    } finally {
      setRunningId(null);
    }
  }

  async function copyCurl(ep: EndpointItem) {
    const url = `${origin || "https://relaynest.app"}${buildResolvedUrl(ep)}`;
    const authLine = ep.requiresAuth
      ? ` \\\n  -H "Authorization: Bearer ${authorizedKey || "YOUR_API_KEY"}"`
      : "";
    const rawBody = bodyValues[ep.id] ?? (ep.requestExample ? JSON.stringify(ep.requestExample) : "");
    const bodyLine = ep.method !== "GET" && ep.method !== "DELETE" && rawBody.trim()
      ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${rawBody.replace(/\n\s*/g, " ")}'`
      : "";
    const cmd = `curl -X ${ep.method} "${url}"${authLine}${bodyLine}`;
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success("cURL command copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  return (
    <div id="swagger-ui" className="space-y-6">
      {/* Swagger Top Header Panel */}
      <Card className="border-primary/40 bg-surface/90 p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">OpenAPI {spec.openapi}</Badge>
              <Badge tone="info">v{spec.info.version}</Badge>
              <Badge tone="primary">Swagger UI Interactive</Badge>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{spec.info.title}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-foreground/80">
              {spec.info.description}
            </p>
            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-surface-2/80 px-3 py-1.5 text-xs text-foreground/80">
              <span className="font-semibold text-lavender">Auth Header:</span>
              <code className="font-mono text-foreground">Authorization: Bearer rnk_live_...</code>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <a
              href="/api/v1/openapi.json"
              download="relaynest-openapi.json"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-xs font-semibold hover:border-lavender"
            >
              <Download className="size-3.5 text-lavender" aria-hidden /> Download openapi.json
            </a>
            <Button
              variant={authorizedKey ? "subtle" : "primary"}
              size="sm"
              onClick={() => setAuthModalOpen((o) => !o)}
              aria-expanded={authModalOpen}
            >
              {authorizedKey ? <Lock className="size-3.5" aria-hidden /> : <Unlock className="size-3.5" aria-hidden />}
              <span>{authorizedKey ? "Authorized (API Key)" : "Authorize Bearer Key"}</span>
            </Button>
          </div>
        </div>

        {/* Inline Authorize Bar (Expandable & Keyboard Accessible) */}
        {authModalOpen && (
          <div className="mt-4 rounded-2xl border border-lavender/40 bg-surface-2/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-lavender">Bearer API Key Authorization (`BearerAuth`)</p>
              <Link href="/settings/api-keys" className="text-xs font-semibold text-accent hover:underline">
                Generate Key in Settings -&gt; API Keys
              </Link>
            </div>
            <p className="mt-1 text-xs text-foreground/75">
              Paste your <code className="text-lavender">rnk_live_...</code> key to test calls directly via Bearer auth, or leave empty to reuse your active dashboard login session cookie.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Input
                  aria-label="Bearer API key token"
                  type={showKey ? "text" : "password"}
                  placeholder="rnk_live_..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setAuthorizedKey(apiKeyInput.trim());
                  setAuthModalOpen(false);
                  toast.success(apiKeyInput.trim() ? "Bearer API key set for Swagger Execute requests" : "Switched to browser session cookie auth");
                }}
              >
                Apply Token
              </Button>
              {authorizedKey && (
                <Button
                  size="sm"
                  variant="danger-outline"
                  onClick={() => {
                    setApiKeyInput("");
                    setAuthorizedKey("");
                    toast.success("Cleared API key");
                  }}
                >
                  Logout Token
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="API tag filter">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeTag === t}
                onClick={() => setActiveTag(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  activeTag === t
                    ? "border-lavender bg-primary text-white"
                    : "border-border/70 bg-surface-2/70 text-foreground/80 hover:border-lavender/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              aria-label="Filter API endpoints"
              placeholder="Filter path or summary..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Endpoint Accordions */}
      <div className="space-y-3">
        {filtered.map((ep) => {
          const isOpen = Boolean(expanded[ep.id]);
          const bodyVal = bodyValues[ep.id] ?? (ep.requestExample ? JSON.stringify(ep.requestExample, null, 2) : "");
          const res = results[ep.id];

          return (
            <Card key={ep.id} className="overflow-hidden border-border/80">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded((prev) => ({ ...prev, [ep.id]: !isOpen }))}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left transition hover:bg-primary/5 sm:px-5"
              >
                <Badge tone={METHOD_TONE[ep.method]} className="w-16 justify-center font-mono text-[11px] font-bold">
                  {ep.method}
                </Badge>
                <code className="font-mono text-sm font-bold text-lavender">{ep.path}</code>
                <span className="min-w-[180px] flex-1 text-xs text-foreground/80">{ep.summary}</span>
                {ep.scope && (
                  <Badge tone="neutral" className="text-[10px]">scope: {ep.scope}</Badge>
                )}
                {isOpen ? <ChevronDown className="size-4 text-muted" aria-hidden /> : <ChevronRight className="size-4 text-muted" aria-hidden />}
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border/60 bg-surface-2/40 p-4 sm:p-5">
                  <p className="text-xs leading-relaxed text-foreground/80">{ep.description}</p>

                  {ep.parameters.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-lavender">Parameters</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {ep.parameters.map((p) => (
                          <div key={p.name} className="panel space-y-1 p-3">
                            <label htmlFor={`${ep.id}-${p.name}`} className="flex items-center justify-between text-xs font-bold">
                              <span>
                                {p.name} <span className="font-mono text-[10px] text-muted">({p.in})</span>
                              </span>
                              {p.required && <span className="text-[10px] text-bad">required</span>}
                            </label>
                            <Input
                              id={`${ep.id}-${p.name}`}
                              className="h-8 text-xs font-mono"
                              placeholder={p.schema?.default !== undefined ? String(p.schema.default) : p.description}
                              value={getParam(ep.id, p.name, p.schema?.default !== undefined ? String(p.schema.default) : "")}
                              onChange={(e) => setParam(ep.id, p.name, e.target.value)}
                            />
                            {p.description && <p className="text-[11px] text-muted">{p.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ep.requestExample !== undefined && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor={`${ep.id}-body`} className="text-xs font-bold uppercase tracking-wider text-lavender">
                          Request Body (application/json)
                        </label>
                        <button
                          type="button"
                          onClick={() => setBodyValues((prev) => ({ ...prev, [ep.id]: JSON.stringify(ep.requestExample, null, 2) }))}
                          className="text-[11px] font-semibold text-lavender hover:underline"
                        >
                          Reset Example
                        </button>
                      </div>
                      <textarea
                        id={`${ep.id}-body`}
                        rows={5}
                        value={bodyVal}
                        onChange={(e) => setBodyValues((prev) => ({ ...prev, [ep.id]: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-[#08081A] p-3 font-mono text-xs text-lavender focus:border-lavender focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => void executeEndpoint(ep)} disabled={runningId === ep.id}>
                      <Play className="size-3.5" aria-hidden />
                      {runningId === ep.id ? "Executing..." : "Execute Live Request"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void copyCurl(ep)}>
                      <Copy className="size-3.5" aria-hidden /> Copy cURL
                    </Button>
                  </div>

                  {/* Live Execution Response */}
                  {res && (
                    <div className="space-y-1.5" role="status" aria-live="polite">
                      <div className="flex items-center gap-2 text-xs">
                        <Terminal className="size-3.5 text-lavender" aria-hidden />
                        <span className="font-bold">Live Server Response:</span>
                        <Badge tone={res.ok ? "success" : "danger"}>HTTP {res.status || "ERR"}</Badge>
                        <span className="font-mono text-muted">{res.latencyMs}ms</span>
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl border border-primary/40 bg-[#08081A] p-3.5 font-mono text-xs text-foreground/95">
                        <code>{res.body}</code>
                      </pre>
                    </div>
                  )}

                  {/* Example Response Schema */}
                  {ep.sampleResponse !== undefined && (
                    <details className="rounded-xl border border-border/70 bg-surface/60 px-3.5 py-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-muted hover:text-foreground">
                        View Example 200 Response Shape
                      </summary>
                      <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-foreground/85">
                        <code>{JSON.stringify(ep.sampleResponse, null, 2)}</code>
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Helpful Cross Links */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-4 text-ok" aria-hidden /> Need Scoped Keys or Outbound Webhooks?
          </p>
          <p className="text-xs text-foreground/75">
            Create API credentials under Settings -&gt; API Keys, or configure Slack/Discord/Signed Webhooks under Integrations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/settings/api-keys" size="sm">
            <KeyRound className="size-3.5" aria-hidden /> API Keys
          </ButtonLink>
          <ButtonLink href="/integrations" variant="outline" size="sm">
            <CheckCircle2 className="size-3.5" aria-hidden /> Integrations
          </ButtonLink>
          <ButtonLink href="/docs" variant="outline" size="sm">
            <Code2 className="size-3.5" aria-hidden /> Full Docs
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
