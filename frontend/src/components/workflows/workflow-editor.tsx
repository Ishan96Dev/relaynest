"use client";

import {
  addEdge, Background, BackgroundVariant, MiniMap, Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, useViewport,
  type Connection, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle, CheckCircle2, ChevronDown, Lock, Maximize2, Minus, MoreVertical, Pencil, Play, Plus, Redo2, Save, Search, Settings, Sparkles,
  Trash2, Undo2, Workflow as WorkflowIcon, X, Zap, Map as MapIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { formatUserDateTime, formatUserTime } from "@backend/lib/preferences";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { executeWorkflow, validateWorkflow, type ExecutionResult, type ValidationIssue, type WorkflowDefinition } from "@backend/server/workflow-engine";
import { FlowNode, type FlowNodeData } from "./flow-node";
import { NODE_SPECS, specFor, type NodeSpec } from "./node-specs";

const nodeTypes = { rn: FlowNode };
type Cfg = Record<string, Record<string, unknown>>;
type Snap = { nodes: Node<FlowNodeData>[]; edges: Edge[]; configs: Cfg };

const branchEdge = (e: Edge): Edge =>
  e.sourceHandle === "true" || e.sourceHandle === "false"
    ? { ...e, label: e.sourceHandle === "true" ? "Yes" : "No", labelStyle: { fill: e.sourceHandle === "true" ? "#22C55E" : "#EF4444", fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: "rgb(var(--rn-surface))" }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 6 }
    : e;

/** What the server stores for a saved automation (see backend/src/server/services/automations.ts). */
export interface EditorInitial {
  id: string; name: string; description: string; status: "draft" | "active" | "archived"; definition: WorkflowDefinition;
  webhook: { url: string; enabled: boolean } | null;
  schedule: { cron: string; timezone: string; enabled: boolean; nextRunAt: string | null; lastRunAt: string | null; lastStatus: string | null } | null;
  runs: { succeeded: number; failed: number };
}
export interface BotOption { id: string; name: string; username: string }
type Info = Pick<EditorInitial, "webhook" | "schedule" | "runs">;
const fromDefinition = (d: WorkflowDefinition): Snap => ({
  nodes: d.nodes.map((n) => ({ id: n.id, type: "rn", position: n.position, data: { type: n.type } })),
  edges: d.edges.map((e) => branchEdge({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}) } as Edge)),
  configs: Object.fromEntries(d.nodes.map((n) => [n.id, n.config as Record<string, unknown>])),
});
const seed = (blank = false, initialBotId?: string): Snap =>
  initialBotId
    ? {
        nodes: [
          { id: "trigger_1", type: "rn", position: { x: 300, y: 20 }, data: { type: "trigger.telegram.message" } },
          { id: "act_1", type: "rn", position: { x: 300, y: 210 }, data: { type: "action.telegram.sendMessage" } },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "act_1" }],
        configs: {
          trigger_1: { botId: initialBotId, commandFilter: "" },
          act_1: { botId: initialBotId, chatIdSource: "trigger", chatId: "", text: "Received your message: {{event.text}}" },
        },
      }
    : {
        nodes: [
          { id: "trigger_1", type: "rn", position: { x: 300, y: 10 }, data: { type: "trigger.webhook" } },
          { id: "cond_1", type: "rn", position: { x: 300, y: 160 }, data: { type: "condition.equals" } },
          { id: "act_1", type: "rn", position: { x: 130, y: 340 }, data: { type: "action.telegram.sendMessage" } },
        ],
        edges: [
          { id: "e1", source: "trigger_1", target: "cond_1" },
          branchEdge({ id: "e2", source: "cond_1", target: "act_1", sourceHandle: "true" }),
        ],
        configs: {
          trigger_1: {},
          cond_1: { field: "event.status", value: "success" },
          act_1: blank
            ? { botId: "", chatIdSource: "configured", chatId: "", text: "Deployment {{event.status}}." }
            : { botId: "my-bot", chatIdSource: "configured", chatId: "123456", text: "Deployment {{event.status}}." },
        },
      };

const STORAGE = "rn-workflow-draft:";

function ZoomPanel({
  showMap,
  setShowMap,
  defaultZoom,
}: {
  showMap: boolean;
  setShowMap: (v: boolean) => void;
  defaultZoom: number;
}) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const appliedInitial = React.useRef(false);

  // Apply the user's Default Canvas Zoom preference once when the editor mounts or defaultZoom changes.
  React.useEffect(() => {
    const target = Math.min(1.5, Math.max(0.5, defaultZoom / 100));
    const timer = window.setTimeout(() => {
      void zoomTo(target, { duration: appliedInitial.current ? 200 : 0 });
      appliedInitial.current = true;
    }, 60);
    return () => window.clearTimeout(timer);
  }, [defaultZoom, zoomTo]);

  const btn = "grid size-8 place-items-center rounded-md text-foreground/85 hover:bg-foreground/10";
  return (
    <Panel position="top-right" className="!m-3 flex items-center gap-1.5">
      <button aria-label="Fit view" className={cn(btn, "card")} onClick={() => fitView({ padding: 0.2, maxZoom: defaultZoom / 100, duration: 300 })}><Maximize2 className="size-4" /></button>
      <button aria-label="Toggle minimap" aria-pressed={showMap} className={cn(btn, "card")} onClick={() => setShowMap(!showMap)}><MapIcon className="size-4" /></button>
      <div className="card flex items-center gap-1 px-1"><button aria-label="Zoom out" className={btn} onClick={() => zoomOut()}><Minus className="size-4" /></button><button type="button" title={`Reset zoom to default (${defaultZoom}%)`} onClick={() => void zoomTo(defaultZoom / 100, { duration: 200 })} className="w-12 text-center text-xs font-semibold tabular-nums hover:text-lavender">{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" className={btn} onClick={() => zoomIn()}><Plus className="size-4" /></button></div>
    </Panel>
  );
}

function Editor({ workflowId, initial, persisted, bots, initialBotId }: { workflowId: string; initial?: EditorInitial; persisted: boolean; bots: BotOption[]; initialBotId?: string }) {
  const { prefs } = usePreferences();
  const init = React.useMemo(() => (initial ? fromDefinition(initial.definition) : seed(persisted, initialBotId)), [initial, persisted, initialBotId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  const [configs, setConfigs] = React.useState<Cfg>(init.configs);
  const [name, setName] = React.useState(initial?.name ?? "Welcome Flow");
  const [description, setDescription] = React.useState(initial?.description ?? (persisted ? "" : "Send a welcome message when a user starts the bot."));
  const [wfId, setWfId] = React.useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = React.useState<"draft" | "active" | "archived">(initial?.status ?? "draft");
  const [info, setInfo] = React.useState<Info | null>(initial ? { webhook: initial.webhook, schedule: initial.schedule, runs: initial.runs } : null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"save" | "publish" | "unpublish" | "secret" | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const setNotice = React.useCallback((m: { tone: "ok" | "bad"; text: string } | null) => {
    if (m) toast[m.tone === "ok" ? "success" : "error"](m.text);
  }, []);
  const [editingName, setEditingName] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [panelTab, setPanelTab] = React.useState<"config" | "advanced">("config");
  const [dirty, setDirty] = React.useState(false);
  const [issues, setIssues] = React.useState<ValidationIssue[] | null>(null);
  const [run, setRun] = React.useState<ExecutionResult | null>(null);
  const [stats, setStats] = React.useState({ ok: 0, failed: 0 });
  const [savedAt, setSavedAt] = React.useState<string>();
  const [showMap, setShowMap] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<Record<string, boolean>>({ Triggers: true, AI: true, Conditions: true, Actions: true });
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const counter = React.useRef(Math.max(10, ...init.nodes.map((n) => Number(n.id.split("_").pop()) || 0)));
  const past = React.useRef<Snap[]>([]);
  const future = React.useRef<Snap[]>([]);
  const lastField = React.useRef("");
  const cur = React.useRef<Snap>(init);
  cur.current = { nodes, edges, configs };

  // Restore a saved local draft.
  React.useEffect(() => {
    if (persisted) return; // saved automations live on the server
    try {
      const raw = localStorage.getItem(STORAGE + workflowId);
      if (!raw) return;
      const s = JSON.parse(raw);
      setNodes(s.nodes); setEdges(s.edges); setConfigs(s.configs); setName(s.name); setSavedAt(s.savedAt);
    } catch { /* ignore corrupt draft */ }
  }, [workflowId, persisted, setNodes, setEdges]);

  // Warn before leaving with unsaved edits.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const definition = React.useMemo<WorkflowDefinition>(() => ({
    version: 1,
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.type as WorkflowDefinition["nodes"][number]["type"], position: n.position, config: configs[n.id] ?? {} })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle === "true" || e.sourceHandle === "false" ? { sourceHandle: e.sourceHandle } : {}) })),
  }), [nodes, edges, configs]);

  /** Record the pre-change state so undo can restore it. */
  const snapshot = React.useCallback(() => {
    past.current.push(structuredClone(cur.current));
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    lastField.current = "";
  }, []);
  const touch = React.useCallback(() => { setDirty(true); setIssues(null); setRun(null); }, []);

  const restore = (s: Snap) => { setNodes(s.nodes); setEdges(s.edges); setConfigs(s.configs); setSelectedId(null); touch(); force(); };
  const undo = () => { const s = past.current.pop(); if (!s) return; future.current.push(structuredClone(cur.current)); restore(s); };
  const redo = () => { const s = future.current.pop(); if (!s) return; past.current.push(structuredClone(cur.current)); restore(s); };

  const onConnect = React.useCallback((c: Connection) => { snapshot(); setEdges((es) => addEdge(branchEdge({ ...c, id: `e_${Date.now()}` } as Edge), es)); touch(); }, [setEdges, snapshot, touch]);

  function addNode(spec: NodeSpec) {
    snapshot();
    const id = `${spec.type.split(".")[0]}_${++counter.current}`;
    const y = Math.max(0, ...nodes.map((n) => n.position.y)) + 160;
    setNodes((ns) => [...ns, { id, type: "rn", position: { x: 300, y }, data: { type: spec.type } }]);
    setConfigs((c) => ({ ...c, [id]: { ...spec.defaults } }));
    setSelectedId(id); setPanelTab("config"); touch(); force();
  }

  function removeSelected() {
    if (!selectedId) return;
    snapshot();
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null); touch(); force();
  }

  function validate() {
    const r = validateWorkflow(definition);
    setIssues(r.issues);
    const bad = new Set(r.issues.map((i) => i.nodeId).filter(Boolean));
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, error: bad.has(n.id), ok: !bad.has(n.id) } })));
    return r;
  }

  async function test() {
    const r = validate();
    setRun(null);
    if (!r.valid) return;
    // Dry run in the browser: actions are simulated, nothing is sent.
    const res = await executeWorkflow(definition, { type: "test", workspaceId: "local", source: "editor", occurredAt: new Date().toISOString(), payload: { status: "success" } },
      {
        sendTelegramMessage: async () => ({ externalMessageId: "simulated" }),
        httpRequest: async () => ({ status: 200 }),
        insertRecord: async () => {},
        runAiResearch: async (i) => ({ text: `[Simulated AI Research for: ${i.prompt.slice(0, 80)}]`, sourcesCount: 4, quotesCount: i.includeMarketData ? 3 : 0, modelUsed: "simulated" }),
      }, { executionId: "test" });
    setRun(res);
    setStats((s) => (res.status === "succeeded" ? { ...s, ok: s.ok + 1 } : { ...s, failed: s.failed + 1 }));
  }

  const fail = React.useCallback(
    (message: string, details?: { message?: string }[]) =>
      setNotice({ tone: "bad", text: details?.[0]?.message ? `${message} ${details[0].message}` : message }),
    [setNotice],
  );
  /** Saves to the server (or to this browser in demo mode). Returns the automation ID, or null when saving failed. */
  const save = React.useCallback(async (silent = false): Promise<string | null> => {
    const at = formatUserTime(new Date(), prefs);
    if (!persisted) {
      localStorage.setItem(STORAGE + workflowId, JSON.stringify({ nodes, edges, configs, name, savedAt: at }));
      setDirty(false); setSavedAt(at);
      return workflowId;
    }
    setBusy("save"); if (!silent) setNotice(null);
    const body = { name, description, definition };
    const res = wfId ? await api<EditorInitial>(`/api/v1/automations/${wfId}`, { method: "PUT", body }) : await api<EditorInitial>("/api/v1/automations", { body });
    setBusy(null);
    if (!res.ok) { if (!silent) fail(res.message, res.details); return null; }
    if (!wfId) window.history.replaceState(null, "", `/workflows/${res.data.id}`);
    setWfId(res.data.id); setStatus(res.data.status); setInfo({ webhook: res.data.webhook, schedule: res.data.schedule, runs: res.data.runs });
    setDirty(false); setSavedAt(at);
    return res.data.id;
  }, [configs, definition, description, edges, fail, name, nodes, persisted, prefs, setNotice, wfId, workflowId]);

  // Honor Editor Preference: Auto-save (debounced 2.5s after changes when enabled).
  React.useEffect(() => {
    if (!prefs.autosave || !dirty || busy !== null) return;
    if (!name.trim() || nodes.length === 0) return;
    const timer = window.setTimeout(() => {
      void save(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [prefs.autosave, dirty, busy, name, nodes.length, save]);

  async function publishConfirmed() {
    setConfirmOpen(false);
    const r = validate();
    if (!r.valid) { fail("Fix the highlighted issues before publishing."); return; }
    const id = dirty || !wfId ? await save() : wfId;
    if (!id) return;
    setBusy("publish"); setNotice(null);
    const res = await api<{ automation: EditorInitial; webhookSecret?: string }>(`/api/v1/automations/${id}/publish`, { method: "POST" });
    setBusy(null);
    if (!res.ok) { fail(res.message, res.details); return; }
    const a = res.data.automation;
    setStatus(a.status); setInfo({ webhook: a.webhook, schedule: a.schedule, runs: a.runs });
    if (res.data.webhookSecret) setSecret(res.data.webhookSecret);
    setNotice({ tone: "ok", text: a.schedule?.enabled ? "Published. The schedule is now running." : "Published. This automation is live." });
  }

  function requestPublish() {
    const r = validate();
    if (!r.valid) { fail("Fix the highlighted issues before publishing."); return; }
    if (prefs.confirmPublish) {
      setConfirmOpen(true);
    } else {
      void publishConfirmed();
    }
  }
  async function unpublish() {
    if (!wfId) return;
    setBusy("unpublish"); setNotice(null);
    const res = await api<EditorInitial>(`/api/v1/automations/${wfId}/unpublish`, { method: "POST" });
    setBusy(null);
    if (!res.ok) { fail(res.message); return; }
    setStatus(res.data.status); setInfo({ webhook: res.data.webhook, schedule: res.data.schedule, runs: res.data.runs });
    setNotice({ tone: "ok", text: "Unpublished. This automation will not run until you publish it again." });
  }
  async function newSecret() {
    if (!wfId) return;
    setBusy("secret");
    const res = await api<{ url: string; secret: string }>(`/api/v1/automations/${wfId}/webhook-secret`, { method: "POST" });
    setBusy(null);
    if (!res.ok) { fail(res.message); return; }
    setSecret(res.data.secret);
  }
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); };

  const selected = nodes.find((n) => n.id === selectedId);
  const spec = selected ? specFor(selected.data.type) : null;
  const setField = (k: string, v: unknown) => {
    if (!selectedId) return;
    const key = `${selectedId}:${k}`;
    if (lastField.current !== key) { snapshot(); lastField.current = key; }
    setConfigs((c) => ({ ...c, [selectedId]: { ...c[selectedId], [k]: v } })); touch();
  };

  const groups = (["Triggers", "AI", "Conditions", "Actions"] as const).map((g) => ({
    g, items: NODE_SPECS.filter((s) => s.group === g && s.label.toLowerCase().includes(query.toLowerCase())),
  }));

  function loadBriefingPreset(preset: { title: string; desc: string; cron: string; category: string; market: boolean; prompt: string }) {
    snapshot();
    const defaultBotId = initialBotId || bots[0]?.id || "";
    setName(preset.title);
    setDescription(preset.desc);
    setNodes([
      { id: "trigger_1", type: "rn", position: { x: 260, y: 20 }, data: { type: "trigger.schedule" } },
      { id: "act_ai_1", type: "rn", position: { x: 260, y: 190 }, data: { type: "action.ai.research" } },
      { id: "act_tg_1", type: "rn", position: { x: 260, y: 370 }, data: { type: "action.telegram.sendMessage" } },
    ]);
    setEdges([
      { id: "e_1", source: "trigger_1", target: "act_ai_1" },
      { id: "e_2", source: "act_ai_1", target: "act_tg_1" },
    ]);
    setConfigs({
      trigger_1: { cron: preset.cron, timezone: "Asia/Kolkata" },
      act_ai_1: { prompt: preset.prompt, category: preset.category, includeWebSearch: true, includeMarketData: preset.market, systemPrompt: "" },
      act_tg_1: { botId: defaultBotId, chatIdSource: "configured", chatId: "", text: "{{ai.text}}" },
    });
    setSelectedId("act_tg_1");
    setPanelTab("config");
    touch();
    force();
    toast.info(`Loaded "${preset.title}" preset — pick your Bot & Telegram Chat ID, then Publish.`);
  }

  return (
    <div className="flex min-h-[640px] flex-col gap-3 lg:h-[calc(100vh-8.5rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <IconTile size="lg" tone="primary" className="rounded-full"><Zap /></IconTile>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {editingName ? (
              <input autoFocus aria-label="Workflow name" value={name} onChange={(e) => { setName(e.target.value); touch(); }} onBlur={() => setEditingName(false)} onKeyDown={(e) => e.key === "Enter" && setEditingName(false)} className="rounded-md bg-surface-2 px-2 text-2xl font-extrabold focus:outline focus:outline-lavender" />
            ) : <h1 className="text-2xl font-extrabold">{name}</h1>}
            <button aria-label="Rename workflow" onClick={() => setEditingName(true)} className="text-muted hover:text-foreground"><Pencil className="size-4" /></button>
            <Badge tone={status === "active" ? "success" : "warning"} dot>{status === "active" ? "Active" : "Draft"}</Badge>
          </div>
          {editingName && persisted
            ? <input aria-label="Description" value={description} maxLength={200} placeholder="Describe what this automation does" onChange={(e) => { setDescription(e.target.value); touch(); }} className="mt-1 w-full max-w-md rounded-md bg-surface-2 px-2 py-1 text-sm focus:outline focus:outline-lavender" />
            : <p className="text-sm text-foreground/75">{description || (persisted ? "No description. Click the pencil to add one." : "")}</p>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty ? (
            <span role="status" className="mr-1 flex items-center gap-1.5 text-xs font-medium text-bad">
              <span className="size-2 rounded-full bg-[#FF4D7E]" aria-hidden />
              {prefs.autosave ? "Unsaved (auto-saving…)" : "Unsaved changes"}
            </span>
          ) : savedAt ? (
            <span role="status" className="mr-1 text-xs text-ok">
              {persisted ? "Saved" : "Draft saved locally"} at {savedAt}
            </span>
          ) : prefs.autosave ? (
            <span className="mr-1 text-xs text-muted">Auto-save on</span>
          ) : null}
          <Button variant="outline" size="sm" aria-label="Undo" onClick={undo} disabled={!past.current.length} className="px-2.5"><Undo2 className="size-4" /></Button>
          <Button variant="outline" size="sm" aria-label="Redo" onClick={redo} disabled={!future.current.length} className="px-2.5"><Redo2 className="size-4" /></Button>
          <Button variant="outline" onClick={test} title="Run this workflow once with sample data. Nothing is published."><Play className="size-4" />Test</Button>
          <Button variant="outline" onClick={() => void save()} title={!dirty && persisted ? "No changes to save." : "Save your changes as a draft."} disabled={busy !== null || (!dirty && (!persisted || wfId !== null))}><Save className="size-4" />{busy === "save" ? "Saving..." : "Save"}</Button>
          {!persisted
            ? <Button disabled title="Publishing needs an account and a connected database."><Zap className="size-4" />Publish</Button>
            : status === "active" && !dirty
              ? <Button variant="outline" onClick={() => void unpublish()} title="Pause this automation. Triggers and schedules stop running." disabled={busy !== null}><Lock className="size-4" />{busy === "unpublish" ? "Pausing..." : "Unpublish"}</Button>
              : <Button onClick={requestPublish} title="Make this automation live so its triggers and schedule start running." disabled={busy !== null}><Zap className="size-4" />{busy === "publish" ? "Publishing..." : "Publish"}</Button>}
          <Button variant="outline" aria-label="More options" title="More options" className="px-2.5"><MoreVertical className="size-4" /></Button>
        </div>
      </div>

      <div className="grid-cols-1 grid min-h-0 flex-1 gap-3 lg:grid-cols-[250px_1fr_320px]">
        <aside aria-label="Node library" className="card flex min-h-0 flex-col p-3">
          <h2 className="mb-2 flex items-center gap-2 px-1 font-bold"><WorkflowIcon className="size-4 text-lavender" aria-hidden />Node Library</h2>
          <Input aria-label="Search nodes" icon={<Search />} placeholder="Search nodes..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 text-xs" />
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {groups.map(({ g, items }) => (
              <div key={g}>
                <button aria-expanded={open[g]} onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))} className="flex w-full items-center justify-between px-1 text-sm font-bold">{g}<ChevronDown className={cn("size-4 text-muted transition", !open[g] && "-rotate-90")} aria-hidden /></button>
                {open[g] && (
                  <ul className="mt-1.5 space-y-1.5">
                    {items.map((s) => <li key={s.type}><button onClick={() => addNode(s)} className="panel flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-semibold hover:border-lavender/60"><Plus className="size-3.5 text-lavender" aria-hidden />{s.label}</button></li>)}
                    {items.length === 0 && <li className="px-1 text-xs text-muted">No matches</li>}
                  </ul>
                )}
              </div>
            ))}
            <div className="border-t border-border/60 pt-3">
              <p className="flex items-center justify-between px-1 text-xs font-bold text-foreground/90">
                <span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-lavender" aria-hidden />Daily Briefing Presets</span>
                <Badge tone="success" className="rounded-full text-[9.5px]">1-Click</Badge>
              </p>
              <ul className="mt-1.5 space-y-1.5" aria-label="Daily AI briefing workflow presets">
                {[
                  {
                    title: "NSE / BSE / MSE Broker Brief",
                    desc: "Weekdays 9 AM IST live Indian stock market briefing to Telegram.",
                    cron: "0 9 * * 1-5",
                    category: "Finance & Markets",
                    market: true,
                    prompt: "Daily Indian Stock Market Broker Briefing: NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX, USD/INR, plus NSE/BSE live prices for RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK and key market news.",
                  },
                  {
                    title: "Real Estate & Land Digest",
                    desc: "Daily 8:30 AM IST land rates, RERA & infra updates to Telegram.",
                    cron: "30 8 * * *",
                    category: "Real Estate & Land",
                    market: false,
                    prompt: "Daily Real Estate & Land Broker Briefing: latest property & plot price trends in India, circle rate updates, RERA announcements, and metro/highway infrastructure news.",
                  },
                  {
                    title: "Student Exam & Scholarship Brief",
                    desc: "Daily 8 AM IST JEE/NEET/UPSC/GATE dates & scholarships.",
                    cron: "0 8 * * *",
                    category: "Education",
                    market: false,
                    prompt: "Daily Student Briefing: latest official JEE, NEET, UPSC, GATE, CUET exam dates, admit cards, results, and open Indian scholarships.",
                  },
                  {
                    title: "Sports & Gaming Daily Recap",
                    desc: "Daily 7 PM IST live cricket/football scores & gaming updates.",
                    cron: "0 19 * * *",
                    category: "Sports",
                    market: false,
                    prompt: "Daily Sports & Gaming Recap: top Cricket, Football & F1 match scores/fixtures plus major gaming patch notes, esports results, and Steam/console deals.",
                  },
                ].map((preset) => (
                  <li key={preset.title}>
                    <button
                      type="button"
                      onClick={() => loadBriefingPreset(preset)}
                      className="panel flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-semibold hover:border-lavender/60"
                    >
                      <Sparkles className="size-3.5 shrink-0 text-lavender" aria-hidden />
                      <span className="truncate">{preset.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <div
          data-editor-theme={prefs.editorTheme}
          className={cn("card relative min-h-[460px] overflow-hidden", prefs.grid && "grid-bg")}
          aria-label="Workflow canvas"
        >
          {nodes.length === 0 && <p className="grid-cols-1 pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-muted">Add a trigger from the Node Library to begin.</p>}
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeDragStart={snapshot} onNodeDragStop={touch}
            onNodesDelete={touch} onEdgesDelete={touch}
            onNodeClick={(_, n) => { setSelectedId(n.id); }} onPaneClick={() => setSelectedId(null)}
            fitView fitViewOptions={{ padding: 0.2, maxZoom: prefs.zoom / 100, minZoom: 0.4 }} minZoom={0.3} maxZoom={1.8} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}
          >
            {prefs.grid && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={22}
                size={prefs.editorTheme === "contrast" ? 1.8 : 1.2}
                color={prefs.editorTheme === "light" ? "#94A3B8" : prefs.editorTheme === "contrast" ? "#C4B5FD" : undefined}
              />
            )}
            <ZoomPanel showMap={showMap} setShowMap={setShowMap} defaultZoom={prefs.zoom} />
            {showMap && (
              <MiniMap
                pannable
                zoomable
                className="!bottom-3 !right-3"
                maskColor={prefs.editorTheme === "light" ? "rgb(241 245 249 / 0.72)" : "rgb(var(--rn-background) / 0.7)"}
                nodeColor={prefs.editorTheme === "contrast" ? "#38BDF8" : "#6C47FF"}
              />
            )}
          </ReactFlow>
        </div>

        <aside aria-label="Configuration" className="card min-h-0 overflow-y-auto p-4">
          {selected && spec ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <IconTile tone="info" size="md"><Zap /></IconTile>
                <div className="min-w-0 flex-1"><h2 className="font-bold leading-tight">{spec.label}</h2><p className="text-xs text-foreground/70">{spec.description}</p></div>
                <button aria-label="Close panel" onClick={() => setSelectedId(null)} className="rounded p-1 text-muted hover:bg-foreground/5"><X className="size-4" /></button>
              </div>
              <div role="tablist" aria-label="Node settings" className="panel flex p-1">
                {([["config", "Configuration", Settings], ["advanced", "Advanced", Zap]] as const).map(([id, label, I]) => (
                  <button key={id} role="tab" aria-selected={panelTab === id} onClick={() => setPanelTab(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", panelTab === id ? "bg-primary/30 text-white ring-1 ring-lavender/60" : "text-muted")}><I className="size-3.5" aria-hidden />{label}</button>
                ))}
              </div>
              {panelTab === "config" ? (
                <>
                  {spec.fields.length === 0 && <p className="text-sm text-muted">No configuration needed.</p>}
                  {spec.fields.map((f) => {
                    const v = configs[selected.id]?.[f.key];
                    const id = `f-${selected.id}-${f.key}`;
                    return (
                      <Field key={f.key} label={f.label} htmlFor={id} hint={f.hint}>
                        {f.kind === "textarea" ? <Textarea id={id} value={String(v ?? "")} className="min-h-28" onChange={(e) => setField(f.key, e.target.value)} />
                          : f.kind === "bot" ? <Select id={id} value={String(v ?? "")} onChange={(e) => setField(f.key, e.target.value)} placeholder="Choose a bot..."><option value="">Choose a bot...</option>{bots.map((b) => <option key={b.id} value={b.id}>{b.name}{b.username ? ` (@${b.username})` : ""}</option>)}</Select>
                          : f.kind === "select" ? <Select id={id} value={String(v ?? "")} onChange={(e) => setField(f.key, e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select>
                          : f.kind === "boolean" ? <div><Switch label={f.label} checked={Boolean(v)} onCheckedChange={(b) => setField(f.key, b)} /></div>
                          : f.kind === "number" ? <Input id={id} type="number" value={Number(v ?? 0)} onChange={(e) => setField(f.key, Number(e.target.value))} />
                          : <Input id={id} value={String(v ?? "")} onChange={(e) => setField(f.key, e.target.value)} />}
                      </Field>
                    );
                  })}
                  {issues && !issues.some((i) => i.nodeId === selected.id) && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-2.5 text-xs text-ok"><CheckCircle2 className="size-4" aria-hidden />Configuration looks good!</p>}
                </>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="panel p-3"><p className="text-xs text-muted">Node ID</p><code className="text-xs">{selected.id}</code></div>
                  <div className="panel p-3"><p className="text-xs text-muted">Node type</p><code className="text-xs">{selected.data.type}</code></div>
                  <p className="text-xs text-muted">Retries, timeouts and error handling use the platform defaults.</p>
                </div>
              )}
              <Button variant="danger-outline" size="sm" onClick={removeSelected}><Trash2 className="size-4" />Remove node</Button>
            </div>
          ) : (
            <p className="text-sm text-foreground/80">Select a node to configure it. Connect nodes by dragging from a handle. Conditions have separate Yes and No outputs.</p>
          )}
        </aside>
      </div>

      <div className="grid-cols-1 grid gap-3 lg:grid-cols-[1fr_1fr_320px]">
        <section className="card flex items-center gap-3 p-3" aria-label="Execution preview">
          <IconTile tone="primary" size="md"><Play /></IconTile>
          <div className="min-w-0 flex-1 leading-tight"><h2 className="font-bold">Execution Preview</h2><p className="text-xs text-foreground/70">Test how this workflow works with sample data.</p></div>
          <Button size="sm" onClick={test}><Play className="size-3.5" />Run Test</Button>
        </section>
        <section className="card flex items-center gap-3 p-3" aria-label="Test results">
          <IconTile tone="success" size="md"><CheckCircle2 /></IconTile>
          <div className="min-w-0 flex-1 leading-tight"><h2 className="font-bold">Test Runs</h2><p className="text-xs text-foreground/70"><span className="text-ok">{stats.ok} successful</span> &middot; <span className={stats.failed ? "text-bad" : ""}>{stats.failed} failed</span> this session</p></div>
          <Link href="/executions" className="text-xs font-semibold text-lavender hover:underline">View Logs <span aria-hidden>&rarr;</span></Link>
        </section>
        <section className="card min-w-0 p-3 text-xs" aria-label="Triggers and runs">
          {persisted && info && status === "active" ? (
            <div className="space-y-1.5">
              {info.schedule?.enabled && <p><span className="font-bold">Schedule</span> <code>{info.schedule.cron}</code> ({info.schedule.timezone}){info.schedule.nextRunAt ? <> &middot; next {formatUserDateTime(info.schedule.nextRunAt, prefs)}</> : null}</p>}
              {info.webhook?.enabled && (
                <div className="space-y-1">
                  <p className="font-bold">Webhook URL</p>
                  <div className="flex items-center gap-1.5"><code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-1.5 py-1" title={info.webhook.url}>{info.webhook.url}</code><Button size="sm" variant="outline" onClick={() => copy(info.webhook!.url)}>Copy</Button></div>
                  <p className="text-muted">Send POST with header <code>x-relaynest-secret</code>.</p>
                  <Button size="sm" variant="outline" onClick={() => void newSecret()} disabled={busy !== null}>{busy === "secret" ? "Creating..." : "New secret"}</Button>
                </div>
              )}
              <p className="text-foreground/80"><span className="text-ok">{info.runs.succeeded} succeeded</span> &middot; <span className={info.runs.failed ? "text-bad" : ""}>{info.runs.failed} failed</span> in the last 30 days</p>
            </div>
          ) : <p className="leading-snug text-foreground/70">{persisted ? "Publish this automation to start it. Schedules, webhooks and Telegram triggers go live on publish." : "Sign in to save and publish automations."}</p>}
        </section>
      </div>
      {secret && (
        <div role="status" className={"card space-y-2 p-3 text-sm"}>
          {secret && (
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Webhook secret (shown once):</span><code className="rounded bg-surface-2 px-2 py-1">{secret}</code><Button size="sm" variant="outline" onClick={() => copy(secret)}>Copy</Button><Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Dismiss</Button></div>
          )}
        </div>
      )}

      {(issues || run) && (
        <div className="grid-cols-1 card grid gap-4 p-4 text-sm md:grid-cols-2" role="status">
          <div>
            <h2 className="mb-2 font-bold">Validation</h2>
            {issues && issues.length === 0 && <p className="flex items-center gap-2 text-ok"><CheckCircle2 className="size-4" aria-hidden />Configuration looks good.</p>}
            <ul className="space-y-1">{issues?.map((i, k) => <li key={k} className="flex items-start gap-2 text-bad"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{i.nodeId ? `${i.nodeId}: ` : ""}{i.message}</li>)}</ul>
          </div>
          {run && (
            <div>
              <h2 className="mb-2 font-bold">Test run (simulated) <Badge tone={run.status === "succeeded" ? "success" : "danger"}>{run.status}</Badge></h2>
              <ol className="space-y-1 font-mono text-xs">{run.steps.map((s, idx) => <li key={`${s.nodeId}-${s.status}-${idx}`}>{s.nodeId} &rarr; {s.status}{s.errorMessageSafe ? ` (${s.errorMessageSafe})` : ""}</li>)}</ol>
            </div>
          )}
        </div>
      )}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Publish Workflow?"
        icon={<IconTile tone="primary" size="md"><Zap /></IconTile>}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => void publishConfirmed()} disabled={busy !== null}>
              <Zap className="size-4" />{busy === "publish" ? "Publishing..." : "Confirm & Publish"}
            </Button>
          </>
        }
      >
        <div className="space-y-2.5 text-sm text-foreground/85">
          <p>
            You are about to publish <span className="font-bold text-foreground">&ldquo;{name}&rdquo;</span> ({nodes.length} nodes, {edges.length} connections).
          </p>
          <p className="text-xs text-muted">
            Once live, its triggers, webhooks, or schedules will start running immediately. You can disable this confirmation dialog anytime in Settings &rarr; Preferences.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export function WorkflowEditor({ workflowId, initial, persisted = false, bots = [], initialBotId }: { workflowId: string; initial?: EditorInitial; persisted?: boolean; bots?: BotOption[]; initialBotId?: string }) {
  return <ReactFlowProvider><Editor workflowId={workflowId} initial={initial} persisted={persisted} bots={bots} initialBotId={initialBotId} /></ReactFlowProvider>;
}