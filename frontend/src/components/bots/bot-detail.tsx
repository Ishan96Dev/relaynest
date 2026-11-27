"use client";

import {
  AlertTriangle, BarChart3, BookOpen, Calendar, Camera, Check, CheckCircle2, Code2, Copy, ExternalLink, Eye, EyeOff,
  History, KeyRound, Link2, MessageSquare, MoreVertical, Play, Plug, Plus, Power, RefreshCw, Save, Send, Settings, Sparkles,
  Trash2, Upload, Users, Webhook, Workflow, Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { BotAnalyticsPayload } from "@backend/lib/execution-format";
import type { AgentTools } from "@backend/server/ai/agent";
import type { BotCommandResponseType } from "@backend/lib/validation/schemas";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS } from "@backend/lib/supabase/storage";
import { BotAnalyticsPanel } from "@/components/analytics/bot-analytics-panel";
import { BotAvatar } from "@/components/bots/bot-avatar";
import { BotKnowledge } from "@/components/knowledge/bot-knowledge";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { Bot, BotHistoryEntry } from "@/types";

const TABS = [
  { id: "general", label: "General", icon: <Settings /> },
  { id: "commands", label: "Commands", icon: <Code2 /> },
  { id: "responses", label: "Responses", icon: <MessageSquare /> },
  { id: "knowledge", label: "Knowledge", icon: <BookOpen /> },
  { id: "automation", label: "Automation", icon: <Workflow /> },
  { id: "integrations", label: "Integrations", icon: <Plug /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 /> },
  { id: "settings", label: "Settings", icon: <Settings /> },
];

const CMD_TYPE_LABEL: Record<BotCommandResponseType, string> = {
  text: "Text Reply",
  builtin: "Built-in",
  chat: "AI Chat",
  search: "Web Search",
  market: "Live Market",
  brief: "Daily Brief",
  image: "Image Gen",
  describe: "Photo Vision",
};

const CMD_RESPONSE_PLACEHOLDER: Record<BotCommandResponseType, string> = {
  text: "Reply text sent to Telegram",
  builtin: "Built-in handler response",
  chat: "AI prompt instruction (optional)",
  search: "Optional web search focus",
  market: "Optional live market focus, e.g. Compare NSE vs BSE prices",
  brief: "Optional default briefing topic or watchlist",
  image: "Optional style template, e.g. A minimalist logo of {input}",
  describe: "What to look for in the photo",
};

const AGENT_TOOL_LABELS: { key: keyof AgentTools; title: string; body: string }[] = [
  { key: "webSearch", title: "Open Web Search (/search)", body: "Allow users to run /search <topic> with live sources, images & videos." },
  { key: "datetime", title: "Date & Time Awareness", body: "Inject current UTC timestamp so the bot knows today and tomorrow." },
  { key: "matchLanguage", title: "Match User Language", body: "Reply in the user's language automatically." },
  { key: "mentionOnly", title: "Groups: Mention Only", body: "In group chats, reply only when @mentioned." },
  { key: "typing", title: "Typing Indicator", body: "Show Telegram typing indicator while preparing replies." },
];

interface BotCmd {
  id?: string;
  command: string;
  description: string;
  responseType: BotCommandResponseType;
  responseText: string;
  instruction: string;
  enabled: boolean;
}

interface KeywordRule {
  id?: string;
  matchType: "keyword";
  matchValue: string;
  responseText: string;
  priority: number;
  enabled: boolean;
}

type BotDetailsPayload = BotAnalyticsPayload;

export function BotDetail({ bot: initialBot, initialHistory = [], demo }: { bot: Bot; initialHistory?: BotHistoryEntry[]; demo: boolean }) {
  const router = useRouter();
  const [bot, setBot] = React.useState(initialBot);
  const telegramDeleted = bot.webhookStatus === "telegram_deleted";
  const [tab, setTab] = React.useState("general");
  const [name, setName] = React.useState(initialBot.name);
  const [description, setDescription] = React.useState(initialBot.description);
  const [category, setCategory] = React.useState(initialBot.category);
  const [welcomeMessage, setWelcomeMessage] = React.useState(initialBot.welcomeMessage ?? "");
  const [defaultResponse, setDefaultResponse] = React.useState(initialBot.defaultResponse ?? "");
  const [active, setActive] = React.useState(initialBot.status === "active");

  React.useEffect(() => {
    setBot(initialBot);
    setName(initialBot.name);
    setDescription(initialBot.description);
    setCategory(initialBot.category);
    setActive(initialBot.status === "active");
  }, [initialBot]);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Bot token reveal / copy / rotate
  const [revealedToken, setRevealedToken] = React.useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = React.useState(false);
  const [newToken, setNewToken] = React.useState("");
  const [rotatingToken, setRotatingToken] = React.useState(false);

  // Avatar upload / Telegram sync
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [revalidating, setRevalidating] = React.useState(false);

  // Test bot modal
  const [testOpen, setTestOpen] = React.useState(false);
  const [testChatId, setTestChatId] = React.useState("");
  const [testMsg, setTestMsg] = React.useState("/start");
  const [testBusy, setTestBusy] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ mode: string; reply: string } | null>(null);

  // Commands tab
  const [cmds, setCmds] = React.useState<BotCmd[]>([]);
  const [cmdsLoaded, setCmdsLoaded] = React.useState(false);
  const [cmdsBusy, setCmdsBusy] = React.useState(false);
  const [cmdsSyncing, setCmdsSyncing] = React.useState(false);

  // Responses tab (backed by `public.bot_responses` + `bots`)
  const [keywordRules, setKeywordRules] = React.useState<KeywordRule[]>([]);
  const [responsesLoaded, setResponsesLoaded] = React.useState(false);
  const [responsesSavedKey, setResponsesSavedKey] = React.useState("");

  // Agent inline knowledge form
  const [knowTitle, setKnowTitle] = React.useState("");
  const [knowContent, setKnowContent] = React.useState("");
  const [knowBusy, setKnowBusy] = React.useState(false);

  // Integrations inline actions
  const [intBusyId, setIntBusyId] = React.useState<string | null>(null);

  // Settings tab AI agent tool toggle busy
  const [agentToolBusy, setAgentToolBusy] = React.useState<string | null>(null);

  // Automation / Analytics / Integrations / Agent details
  const [details, setDetails] = React.useState<BotDetailsPayload | null>(null);
  const [analyticsRange, setAnalyticsRange] = React.useState<"7" | "30" | "all">("30");
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  const dirty = name !== bot.name || description !== bot.description || category !== bot.category;
  const currentResponsesKey = JSON.stringify({
    welcomeMessage,
    defaultResponse,
    rules: keywordRules.map((r) => ({ matchValue: r.matchValue, responseText: r.responseText, priority: r.priority, enabled: r.enabled })),
  });
  const responsesDirty = responsesLoaded
    ? currentResponsesKey !== responsesSavedKey
    : welcomeMessage !== (bot.welcomeMessage ?? "") || defaultResponse !== (bot.defaultResponse ?? "");
  const connected = bot.webhookStatus === "registered" || bot.webhookStatus === "polling";

  const call = React.useCallback(
    async <T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false }> => {
      if (demo) { toast.error("Demo mode: connect Supabase to save changes."); return { ok: false }; }
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
      if (res.status === 204) return { ok: true, data: undefined as T };
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast.error(j?.error?.message ?? "Request failed."); return { ok: false }; }
      return { ok: true, data: j.data as T };
    },
    [demo],
  );

  const loadCommands = React.useCallback(async (forceSync = false) => {
    if (demo) { setCmdsLoaded(true); return; }
    if (forceSync) setCmdsSyncing(true);
    try {
      const r = await fetch(`/api/v1/bots/${bot.id}/commands${forceSync ? "?sync=1" : ""}`);
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j?.data) {
        setCmds(
          (j.data as { id: string; command: string; description: string | null; responseType?: BotCommandResponseType; responseText: string; instruction?: string; enabled: boolean }[]).map((c) => ({
            id: c.id,
            command: c.command,
            description: c.description ?? "",
            responseType: c.responseType ?? "text",
            responseText: c.responseText ?? "",
            instruction: c.instruction ?? "",
            enabled: c.enabled,
          })),
        );
        if (forceSync) toast.success("Commands synced from AI Agent & Telegram");
      }
    } finally {
      setCmdsLoaded(true);
      setCmdsSyncing(false);
    }
  }, [bot.id, demo]);

  const loadResponses = React.useCallback(async () => {
    if (demo) { setResponsesLoaded(true); return; }
    try {
      const r = await fetch(`/api/v1/bots/${bot.id}/responses`);
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j?.data) {
        const d = j.data as {
          welcomeMessage: string;
          defaultResponse: string;
          rules: { id: string; matchType: "welcome" | "default" | "keyword"; matchValue: string | null; responseText: string; priority: number; enabled: boolean }[];
        };
        const kw: KeywordRule[] = d.rules
          .filter((x) => x.matchType === "keyword")
          .map((x) => ({
            id: x.id,
            matchType: "keyword",
            matchValue: x.matchValue ?? "",
            responseText: x.responseText,
            priority: x.priority,
            enabled: x.enabled,
          }));
        setWelcomeMessage(d.welcomeMessage);
        setDefaultResponse(d.defaultResponse);
        setKeywordRules(kw);
        setResponsesSavedKey(
          JSON.stringify({
            welcomeMessage: d.welcomeMessage,
            defaultResponse: d.defaultResponse,
            rules: kw.map((x) => ({ matchValue: x.matchValue, responseText: x.responseText, priority: x.priority, enabled: x.enabled })),
          }),
        );
      }
    } finally {
      setResponsesLoaded(true);
    }
  }, [bot.id, demo]);

  const loadDetails = React.useCallback(async (range: "7" | "30" | "all" = analyticsRange) => {
    if (demo) return;
    setDetailsLoading(true);
    try {
      const r = await fetch(`/api/v1/bots/${bot.id}/details?days=${range}`).catch(() => null);
      const j = r && r.ok ? await r.json().catch(() => null) : null;
      if (j?.data) setDetails(j.data as BotDetailsPayload);
    } finally {
      setDetailsLoading(false);
    }
  }, [bot.id, demo, analyticsRange]);

  React.useEffect(() => {
    if (demo) { setCmdsLoaded(true); setResponsesLoaded(true); return; }
    void Promise.all([loadDetails(), loadCommands(false), loadResponses()]);
  }, [demo, loadDetails, loadCommands, loadResponses]);

  const [nameErr, setNameErr] = React.useState<string>();
  async function save() {
    if (!name.trim()) { setNameErr("Enter a bot name."); requestAnimationFrame(() => document.getElementById("b-name")?.focus()); return; }
    setSaving(true);
    const r = await call<{ name: string; description: string | null; category: string | null }>(`/api/v1/bots/${bot.id}`, "PATCH", { name, description, category });
    setSaving(false);
    if (r.ok) {
      setBot((b) => ({ ...b, name: r.data.name, description: r.data.description ?? "", category: r.data.category ?? "" }));
      toast.success("Bot saved and synced with Telegram");
      router.refresh();
    }
  }

  async function saveResponses() {
    if (keywordRules.some((r) => !r.matchValue.trim() || !r.responseText.trim())) {
      toast.error("Every keyword rule needs a trigger keyword and a reply.");
      return;
    }
    setSaving(true);
    const r = await call<{
      welcomeMessage: string;
      defaultResponse: string;
      rules: { id: string; matchType: "welcome" | "default" | "keyword"; matchValue: string | null; responseText: string; priority: number; enabled: boolean }[];
    }>(`/api/v1/bots/${bot.id}/responses`, "PUT", {
      welcomeMessage,
      defaultResponse,
      rules: keywordRules.map((x) => ({
        matchType: "keyword",
        matchValue: x.matchValue.trim(),
        responseText: x.responseText.trim(),
        priority: x.priority,
        enabled: x.enabled,
      })),
    });
    setSaving(false);
    if (r.ok) {
      const kw: KeywordRule[] = r.data.rules
        .filter((x) => x.matchType === "keyword")
        .map((x) => ({
          id: x.id,
          matchType: "keyword",
          matchValue: x.matchValue ?? "",
          responseText: x.responseText,
          priority: x.priority,
          enabled: x.enabled,
        }));
      setBot((b) => ({ ...b, welcomeMessage: r.data.welcomeMessage, defaultResponse: r.data.defaultResponse }));
      setWelcomeMessage(r.data.welcomeMessage);
      setDefaultResponse(r.data.defaultResponse);
      setKeywordRules(kw);
      setResponsesSavedKey(
        JSON.stringify({
          welcomeMessage: r.data.welcomeMessage,
          defaultResponse: r.data.defaultResponse,
          rules: kw.map((x) => ({ matchValue: x.matchValue, responseText: x.responseText, priority: x.priority, enabled: x.enabled })),
        }),
      );
      toast.success("Responses saved in Supabase");
      router.refresh();
    }
  }

  async function saveCommands() {
    if (cmds.some((c) => !c.command.trim())) {
      toast.error("Every command needs a name.");
      return;
    }
    if (cmds.some((c) => c.responseType === "text" && !c.responseText.trim())) {
      toast.error("Every Text Reply command needs a response message.");
      return;
    }
    setCmdsBusy(true);
    const r = await call<{ commands: { id: string; command: string; description: string | null; responseType: BotCommandResponseType; responseText: string; instruction: string; enabled: boolean }[]; synced: boolean }>(
      `/api/v1/bots/${bot.id}/commands`,
      "PUT",
      {
        commands: cmds.map((c) => ({
          command: c.command.replace(/^\//, "").trim(),
          description: c.description.trim(),
          responseType: c.responseType,
          responseText: c.responseText,
          instruction: c.responseType === "text" || c.responseType === "builtin" ? c.instruction : c.responseText,
          enabled: c.enabled,
        })),
      },
    );
    setCmdsBusy(false);
    if (r.ok) {
      setCmds(
        r.data.commands.map((c) => ({
          id: c.id,
          command: c.command,
          description: c.description ?? "",
          responseType: c.responseType,
          responseText: c.responseText,
          instruction: c.instruction,
          enabled: c.enabled,
        })),
      );
      toast.success(r.data.synced ? "Commands saved in Supabase and synced to Telegram" : "Commands saved in Supabase");
      router.refresh();
    }
  }

  async function addAgentKnowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!details?.agent) return;
    if (!knowTitle.trim() || !knowContent.trim()) {
      toast.error("Enter both a title and knowledge content.");
      return;
    }
    setKnowBusy(true);
    const r = await call<{ id: string; title: string; content: string; createdAt: string }>(`/api/v1/ai-agents/${details.agent.id}/knowledge`, "POST", {
      title: knowTitle.trim(),
      content: knowContent.trim(),
    });
    setKnowBusy(false);
    if (r.ok) {
      setDetails((d) => (d ? { ...d, agentKnowledge: [...d.agentKnowledge, r.data] } : d));
      setKnowTitle("");
      setKnowContent("");
      toast.success("Knowledge source saved in Supabase");
    }
  }

  async function removeAgentKnowledge(knowledgeId: string) {
    if (!details?.agent) return;
    const r = await call(`/api/v1/ai-agents/${details.agent.id}/knowledge/${knowledgeId}`, "DELETE");
    if (r.ok) {
      setDetails((d) => (d ? { ...d, agentKnowledge: d.agentKnowledge.filter((k) => k.id !== knowledgeId) } : d));
      toast.success("Knowledge source removed");
    }
  }

  async function toggleIntegrationStatus(id: string, enabled: boolean) {
    setIntBusyId(id);
    const r = await call<{ status: string }>(`/api/v1/integrations/${id}`, "PATCH", { enabled });
    setIntBusyId(null);
    if (r.ok) {
      setDetails((d) => (d ? { ...d, integrations: d.integrations.map((i) => (i.id === id ? { ...i, status: r.data.status } : i)) } : d));
      toast.success(enabled ? "Integration enabled" : "Integration paused");
    }
  }

  async function runIntegrationTest(id: string) {
    setIntBusyId(id);
    const r = await call<{ delivered: boolean; statusCode: number; latencyMs: number; error: string | null }>(`/api/v1/integrations/${id}/test`, "POST", {});
    setIntBusyId(null);
    if (r.ok) {
      if (r.data.delivered) toast.success(`Delivered HTTP ${r.data.statusCode} in ${r.data.latencyMs}ms`);
      else toast.error(r.data.error ?? "Delivery test failed");
      void loadDetails();
    }
  }

  async function toggleAgentTool(key: keyof AgentTools, checked: boolean) {
    if (!details?.agent) return;
    setAgentToolBusy(key);
    const nextTools = { ...details.agent.tools, [key]: checked };
    const r = await call<{ tools: AgentTools }>(`/api/v1/ai-agents/${details.agent.id}`, "PATCH", { tools: nextTools });
    setAgentToolBusy(null);
    if (r.ok) {
      setDetails((d) => (d && d.agent ? { ...d, agent: { ...d.agent, tools: r.data.tools } } : d));
      toast.success("AI agent setting saved in Supabase");
      if (key === "webSearch") void loadCommands(false);
    }
  }

  async function toggle(next: boolean) {
    const r = await call<{ webhookStatus: Bot["webhookStatus"]; status: Bot["status"] }>(`/api/v1/bots/${bot.id}/${next ? "activate" : "deactivate"}`, "POST");
    if (r.ok) {
      setActive(next);
      setBot((b) => ({ ...b, status: r.data.status, webhookStatus: r.data.webhookStatus }));
      toast.success(next ? "Bot activated" : "Bot paused");
      router.refresh();
    }
  }

  async function toggleRevealToken() {
    if (revealedToken) { setRevealedToken(null); return; }
    setTokenLoading(true);
    const r = await call<{ token: string }>(`/api/v1/bots/${bot.id}/token`, "GET");
    setTokenLoading(false);
    if (r.ok) setRevealedToken(r.data.token);
  }

  async function rotateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newToken.trim()) return;
    setRotatingToken(true);
    const r = await call<{ username: string | null; webhookStatus: Bot["webhookStatus"] }>(`/api/v1/bots/${bot.id}/token`, "PUT", { token: newToken.trim() });
    setRotatingToken(false);
    if (r.ok) {
      setNewToken("");
      setRevealedToken(null);
      setBot((b) => ({ ...b, username: r.data.username ?? b.username, webhookStatus: r.data.webhookStatus }));
      toast.success("Bot token updated and verified with Telegram");
      router.refresh();
    }
  }

  async function revalidate() {
    setRevalidating(true);
    const r = await call<{ username: string | null; avatarPath: string | null; status: Bot["status"]; webhookStatus: Bot["webhookStatus"] }>(`/api/v1/bots/${bot.id}/revalidate`, "POST");
    setRevalidating(false);
    if (r.ok) {
      setBot((b) => ({
        ...b,
        username: r.data.username ?? b.username,
        avatarPath: r.data.avatarPath ?? b.avatarPath,
        status: r.data.status,
        webhookStatus: r.data.webhookStatus,
      }));
      if (r.data.webhookStatus === "telegram_deleted") {
        toast.error("Bot deleted on Telegram! Please delete this bot now and recreate it if needed.");
      } else {
        toast.success("Telegram connection verified and synced");
      }
      router.refresh();
    }
  }

  async function syncTelegramPhoto() {
    setPhotoBusy(true);
    const r = await call<{ bot: { avatarPath: string | null }; synced: boolean; message?: string }>(`/api/v1/bots/${bot.id}/photo`, "POST");
    setPhotoBusy(false);
    if (r.ok) {
      if (r.data.synced) {
        setBot((b) => ({ ...b, avatarPath: r.data.bot.avatarPath }));
        toast.success("Synced bot photo from Telegram");
        router.refresh();
      } else {
        toast.info(r.data.message ?? "No profile photo set on Telegram yet.");
      }
    }
  }

  async function uploadAvatar(file: File) {
    if (demo) { toast.error("Demo mode: connect Supabase to upload an avatar."); return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Use PNG, JPG or WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2 MB."); return; }
    setPhotoBusy(true);
    try {
      const sb = await createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { toast.error("Your session expired. Sign in again."); return; }
      let uploadBlob: Blob = file;
      let ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      let contentType = file.type;
      try {
        const bmp = await createImageBitmap(file);
        const side = Math.min(640, Math.max(bmp.width, bmp.height));
        const canvas = document.createElement("canvas");
        canvas.width = side; canvas.height = side;
        const c2d = canvas.getContext("2d");
        if (c2d) {
          const scale = Math.max(side / bmp.width, side / bmp.height);
          const w = bmp.width * scale, h = bmp.height * scale;
          c2d.drawImage(bmp, (side - w) / 2, (side - h) / 2, w, h);
          const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
          if (jpg) { uploadBlob = jpg; ext = "jpg"; contentType = "image/jpeg"; }
        }
        bmp.close();
      } catch {
        // Fallback to original file if canvas conversion is unavailable.
      }
      const path = `${session.user.id}/bot-${bot.id}-${Date.now()}.${ext}`;
      const up = await sb.storage.from(BUCKETS.avatars).upload(path, uploadBlob, { contentType, cacheControl: "3600", upsert: true });
      if (up.error) { toast.error(`Could not upload image: ${up.error.message}`); return; }
      const r = await call<{ avatarPath: string | null }>(`/api/v1/bots/${bot.id}`, "PATCH", { avatarPath: path });
      if (r.ok) {
        setBot((b) => ({ ...b, avatarPath: r.data.avatarPath }));
        toast.success("Bot avatar updated & synced to Telegram");
        router.refresh();
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testMsg.trim()) return;
    setTestBusy(true);
    const r = await call<{ sent: boolean; mode: string; reply: string }>(`/api/v1/bots/${bot.id}/test`, "POST", {
      chatId: testChatId.trim() || undefined,
      message: testMsg.trim(),
    });
    setTestBusy(false);
    if (r.ok) {
      setTestResult({ mode: r.data.mode, reply: r.data.reply });
      if (r.data.sent) toast.success("Test message sent on Telegram");
    }
  }

  async function remove() {
    const r = await call(`/api/v1/bots/${bot.id}`, "DELETE");
    if (r.ok) { toast.success("Bot deleted"); router.push("/bots"); } else setConfirmDelete(false);
  }

  const displayMessages = details?.stats.messages ?? bot.messages;
  const displayActiveUsers = details?.stats.activeUsers ?? bot.activeUsers;
  const displayExecutions = details?.stats.executionsTotal ?? bot.executionsCount ?? bot.messages;

  const stat = (Icon: typeof Zap, value: number, label: string) => (
    <div key={label} className="card flex items-center gap-3 px-4 py-3">
      <IconTile size="md" tone="primary"><Icon /></IconTile>
      <div className="leading-tight"><dd className="text-xl font-extrabold tabular-nums">{value.toLocaleString()}</dd><dt className="text-xs text-muted">{label}</dt></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <BotAvatar name={bot.name} avatarPath={bot.avatarPath} className="size-20 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">{bot.name}</h1>
            <Badge tone={telegramDeleted ? "danger" : connected ? "success" : "neutral"} dot className="rounded-full px-3 py-1 text-xs">
              {telegramDeleted ? "Deleted on Telegram" : connected ? "Connected" : "Not connected"}
            </Badge>
            {(details?.agent || bot.linkedAgentId) && (
              <Link href={`/ai/agents/${details?.agent?.id ?? bot.linkedAgentId}`} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-lavender hover:bg-primary/25">
                <Sparkles className="size-3.5" aria-hidden />Edit AI Agent{(details?.agent?.modelName ?? bot.linkedAgentModelName) ? ` · ${details?.agent?.modelName ?? bot.linkedAgentModelName}` : ""}
              </Link>
            )}
          </div>
          <p className="mt-1 text-[15px] text-foreground/85">{bot.username ? `@${bot.username}` : "No Telegram username yet"}</p>
          <p className="text-sm text-muted">Telegram Bot &middot; Created {bot.createdAt}</p>
        </div>
        <dl className="flex flex-wrap gap-3">
          {stat(MessageSquare, displayMessages, "Messages")}
          {stat(Users, displayActiveUsers, "Active Users")}
          {stat(Zap, displayExecutions, "Executions")}
        </dl>
        <div className="relative flex items-center gap-2">
          <Button variant="outline" onClick={() => { setTestResult(null); setTestOpen(true); }} title="Send a real Telegram message or simulate a bot reply."><Play className="size-4" />Test Bot</Button>
          {bot.username && (
            <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer" className="btn-primary-bg inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white"><Send className="size-4" aria-hidden />Open in Telegram</a>
          )}
          <Button variant="outline" aria-label="More options" title="More options" className="px-2.5" onClick={() => setMenuOpen((o) => !o)}><MoreVertical className="size-4" /></Button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
              <button type="button" onClick={() => { setMenuOpen(false); void syncTelegramPhoto(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-foreground/5"><RefreshCw className="size-3.5 text-lavender" />Sync Photo from Telegram</button>
              <button type="button" onClick={() => { setMenuOpen(false); void revalidate(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-foreground/5"><CheckCircle2 className="size-3.5 text-ok" />Re-validate Connection</button>
              <button type="button" onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(bot.id); toast.success("Bot ID copied"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-foreground/5"><Copy className="size-3.5 text-muted" />Copy Bot ID</button>
              <button type="button" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-bad hover:bg-danger/10"><Trash2 className="size-3.5" />Delete Bot</button>
            </div>
          )}
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Bot sections" />

      {telegramDeleted && (
        <div role="alert" className="rn-callout p-4 sm:p-5" data-tone="danger">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <IconTile tone="danger" size="lg"><AlertTriangle className="animate-pulse" /></IconTile>
              <div>
                <h2 className="text-base font-extrabold text-foreground">This bot was deleted on Telegram</h2>
                <p className="mt-1 max-w-2xl text-sm text-foreground/85">
                  Telegram rejected the saved bot token (deleted in <span className="font-semibold">@BotFather</span> or revoked).
                  Please delete this bot now from RelayNest and recreate or connect a replacement bot if required.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" />Delete Bot Now</Button>
              <ButtonLink href="/bots/new" variant="outline" size="sm"><Plus className="size-4" />Recreate Bot</ButtonLink>
            </div>
          </div>
        </div>
      )}

      {tab === "general" ? (
        <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1fr_390px]">
          <Card>
            <CardHeader title="General Configuration" description="Basic information and settings for your Telegram bot."
              action={
                <>
                  {dirty && <span className="text-xs font-medium text-warn">Unsaved changes</span>}
                  <Button size="md" onClick={save} title={dirty ? "Save your changes to Supabase and sync with Telegram." : "No changes to save."} disabled={!dirty || saving}><Save className="size-4" />{saving ? "Saving..." : "Save Changes"}</Button>
                </>
              } />
            <div className="space-y-5 p-5 pt-2">
              <div className="grid-cols-1 grid gap-5 md:grid-cols-[auto_1fr]">
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Bot Avatar</p>
                  <div className="flex gap-3">
                    <div className="relative">
                      <BotAvatar name={bot.name} avatarPath={bot.avatarPath} className="size-28 rounded-2xl" />
                      <button type="button" aria-label="Upload bot avatar" title="Upload bot avatar" onClick={() => fileRef.current?.click()} disabled={photoBusy}
                        className="grid-cols-1 absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-lg bg-primary text-white transition hover:brightness-110 disabled:opacity-50">
                        <Camera className="size-3.5" />
                      </button>
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadAvatar(f); }} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
                      className="flex w-28 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-lavender/50 bg-surface-2/60 text-center text-xs text-foreground/85 transition hover:border-lavender hover:bg-primary/10 disabled:opacity-50">
                      <Upload className="size-5 text-lavender" aria-hidden />
                      <span className="font-semibold">{photoBusy ? "Uploading..." : "Upload New"}</span>
                      <span className="text-[10px] text-muted">JPG, PNG, WebP<br />(Max 2 MB)</span>
                    </button>
                  </div>
                  <button type="button" onClick={() => void syncTelegramPhoto()} disabled={photoBusy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-lavender hover:underline disabled:opacity-50">
                    <RefreshCw className={photoBusy ? "size-3 animate-spin" : "size-3"} aria-hidden />Sync photo from Telegram
                  </button>
                </div>
                <div className="space-y-4">
                  <Field label="Bot Name" htmlFor="b-name" required error={nameErr} counter={`${name.length} / 50`}><Input id="b-name" maxLength={50} value={name} onChange={(e) => { setName(e.target.value); setNameErr(undefined); }} /></Field>
                  <Field label="Description" htmlFor="b-desc" counter={`${description.length} / 300`}><Textarea id="b-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" /></Field>
                </div>
              </div>
              <div className="grid-cols-1 grid gap-4 md:grid-cols-2">
                <Field label="Telegram Username" htmlFor="b-user" required>
                  <Input id="b-user" readOnly value={bot.username ? `@${bot.username}` : ""} trailing={
                    <button type="button" aria-label="Copy username" onClick={() => { navigator.clipboard?.writeText(`@${bot.username}`); setCopied(true); toast.success("Username copied"); setTimeout(() => setCopied(false), 1500); }} className="grid-cols-1 grid size-7 place-items-center rounded text-muted hover:text-foreground">
                      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                    </button>} />
                </Field>
                <Field label="Category (Optional)" htmlFor="b-cat" counter={`${category.length} / 60`}><Input id="b-cat" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
              </div>

              <div className="border-t border-border/70 pt-5">
                <h3 className="flex items-center gap-2 text-lg font-bold"><Link2 className="size-5 text-lavender" aria-hidden />Connection Information</h3>
                <p className="text-sm text-muted">Details about your Telegram bot connection.</p>
                <div className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border p-3 ${connected ? "border-success/45 bg-success/10" : "border-border bg-surface-2/60"}`}>
                  <CheckCircle2 className={`size-7 ${connected ? "text-ok" : "text-muted"}`} aria-hidden />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className={`font-semibold ${connected ? "text-ok" : ""}`}>{connected ? "Connected" : "Webhook not registered"}</p>
                    <p className="text-sm text-foreground/80">{connected ? "Your bot is successfully connected to Telegram and ready to use." : "Activate the bot to register its Telegram webhook."}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void revalidate()} disabled={revalidating} title="Check bot token and photo with Telegram now.">
                    <RefreshCw className={revalidating ? "size-3.5 animate-spin" : "size-3.5"} />{revalidating ? "Checking..." : "Re-validate"}
                  </Button>
                </div>
                <div className="grid-cols-1 mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="panel flex items-center gap-3 p-3">
                    <IconTile size="md" tone="primary"><Code2 /></IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">Bot Token</p>
                      <p className="truncate font-mono text-xs tracking-wider">{revealedToken ?? "••••••••••••"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {revealedToken && (
                        <button type="button" aria-label="Copy bot token" title="Copy bot token" onClick={() => { navigator.clipboard?.writeText(revealedToken); toast.success("Bot token copied"); }} className="grid size-7 place-items-center rounded text-muted hover:text-foreground">
                          <Copy className="size-3.5" />
                        </button>
                      )}
                      <button type="button" aria-label={revealedToken ? "Hide bot token" : "Show bot token"} title={revealedToken ? "Hide bot token" : "Reveal bot token"} onClick={() => void toggleRevealToken()} disabled={tokenLoading} className="grid size-7 place-items-center rounded text-muted hover:text-foreground disabled:opacity-50">
                        {revealedToken ? <Eye className="size-4 text-lavender" /> : <EyeOff className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="panel flex items-center gap-3 p-3"><IconTile size="md" tone="primary"><Calendar /></IconTile><div><p className="text-xs text-muted">Connected Since</p><p className="text-sm font-semibold">{bot.createdAt}</p></div></div>
                  <div className="panel flex items-center gap-3 p-3"><IconTile size="md" tone="primary"><Zap /></IconTile><div><p className="text-xs text-muted">Last Active</p><p className="text-sm font-semibold">{bot.lastActive}</p></div></div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Eye className="size-3.5" aria-hidden />Token is encrypted at rest. Only workspace owners and admins can reveal it.</p>
              </div>
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold"><Zap className="size-5 text-lavender" aria-hidden />Bot Status</h2>
                  <p className="mt-0.5 text-sm text-foreground/80">The bot is {active ? "active and can receive messages" : "paused and will not respond"}.</p>
                </div>
                <Switch label="Bot active" checked={active} onCheckedChange={toggle} />
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5"><span className={`size-2.5 rounded-full ${active ? "bg-success" : "bg-warning"}`} aria-hidden /><dd className="font-semibold">{active ? "Active" : "Paused"}</dd></div>
                <div className="flex items-center gap-2.5 text-foreground/85"><Users className="size-4 text-lavender" aria-hidden /><dt className="sr-only">Active users</dt><dd>{displayActiveUsers.toLocaleString()} Active Users</dd></div>
                <div className="flex items-center gap-2.5 text-foreground/85"><MessageSquare className="size-4 text-lavender" aria-hidden /><dt className="sr-only">Messages</dt><dd>{displayMessages.toLocaleString()} Messages Processed</dd></div>
              </dl>
            </Card>

            {details?.agent && (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-bold"><Sparkles className="size-4 text-lavender" aria-hidden />Linked AI Agent</h2>
                    <p className="mt-0.5 text-xs text-muted">{details.agent.modelName ?? "No chat model"} · {details.agent.memoryTurns} turns memory</p>
                  </div>
                  <ButtonLink href={`/ai/agents/${details.agent.id}`} variant="outline" size="sm">Open Studio</ButtonLink>
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Power className="size-5 text-lavender" aria-hidden />Quick Actions</h2>
              <div className="grid-cols-1 mt-3 grid grid-cols-2 gap-2.5">
                {[
                  { t: "Test Bot", d: "Send a test message", I: Play, action: () => { setTestResult(null); setTestOpen(true); } },
                  { t: "View Analytics", d: "Usage & performance", I: BarChart3, action: () => setTab("analytics") },
                  { t: "Manage Commands", d: `${cmds.length} configured`, I: Code2, action: () => setTab("commands") },
                  { t: "Setup Automation", d: "Create workflows", I: Workflow, action: () => setTab("automation") },
                ].map(({ t, d, I, action }) => (
                  <button key={t} type="button" onClick={action}
                    className="panel flex items-center gap-2.5 p-3 text-left transition hover:border-lavender/60">
                    <I className="size-5 shrink-0 text-lavender" aria-hidden /><span className="leading-tight"><span className="block text-sm font-semibold">{t}</span><span className="block text-[11px] text-muted">{d}</span></span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="border-danger/40 p-4">
              <div className="flex items-center gap-3">
                <IconTile tone="danger" size="md"><Trash2 /></IconTile>
                <div className="min-w-0 flex-1 leading-tight"><h2 className="font-bold text-bad">Danger Zone</h2><p className="text-xs text-foreground/75">Permanently delete this bot and all its data.</p></div>
                <Button variant="danger-outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="size-3.5" />Delete Bot</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : tab === "commands" ? (
        <Card className="p-5">
          <CardHeader title="Bot Commands" description="Slash commands stored in Supabase (bot_commands), synced with Telegram's menu and any linked AI Agent."
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void loadCommands(true)} disabled={cmdsSyncing}>
                  <RefreshCw className={`size-4 ${cmdsSyncing ? "animate-spin" : ""}`} />{cmdsSyncing ? "Syncing..." : "Sync from Telegram"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCmds((c) => [...c, { command: "", description: "", responseType: "text", responseText: "", instruction: "", enabled: true }])}>
                  <Plus className="size-4" />Add Command
                </Button>
                <Button size="sm" onClick={() => void saveCommands()} disabled={cmdsBusy}>
                  <Save className="size-4" />{cmdsBusy ? "Syncing..." : "Save & Sync to Telegram"}
                </Button>
              </div>
            } />
          {details?.agent && (
            <div className="mx-5 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs text-foreground/90">
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-lavender" aria-hidden />
                Synced with AI Agent <strong>{details.agent.name}</strong>. Built-in, AI, and custom slash commands are stored in Supabase and pushed to Telegram together.
              </span>
              <Link href={`/ai/agents/${details.agent.id}?step=4`} className="font-semibold text-lavender hover:underline">Edit in AI Agent Studio &rarr;</Link>
            </div>
          )}
          {!cmdsLoaded ? <p className="p-5 text-sm text-muted">Loading commands...</p> : cmds.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No commands yet. Click Add Command or Sync from Telegram to load existing commands.</p>
          ) : (
            <div className="space-y-3 p-5 pt-2">
              {cmds.map((c, i) => (
                <div key={c.id ?? i} className="panel grid grid-cols-1 gap-3 p-3 lg:grid-cols-[155px_140px_1fr_1.3fr_auto] lg:items-center">
                  <Input
                    aria-label="Command name"
                    icon={<span className="text-xs font-bold text-lavender">/</span>}
                    placeholder="start"
                    value={c.command}
                    onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, command: e.target.value.replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_]/g, "") } : x)))}
                  />
                  <Select
                    aria-label="Command type"
                    value={c.responseType}
                    onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, responseType: e.target.value as BotCommandResponseType } : x)))}
                  >
                    {(Object.keys(CMD_TYPE_LABEL) as BotCommandResponseType[]).map((k) => (
                      <option key={k} value={k}>{CMD_TYPE_LABEL[k]}</option>
                    ))}
                  </Select>
                  <Input
                    aria-label="Command description"
                    placeholder="Menu description"
                    value={c.description}
                    onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))}
                  />
                  <Input
                    aria-label="Command response or instruction"
                    placeholder={CMD_RESPONSE_PLACEHOLDER[c.responseType]}
                    value={c.responseText}
                    onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, responseText: e.target.value } : x)))}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Switch label="Enabled" checked={c.enabled} onCheckedChange={(v) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, enabled: v } : x)))} />
                    <button type="button" aria-label="Remove command" onClick={() => setCmds((all) => all.filter((_, idx) => idx !== i))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-bad"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : tab === "responses" ? (
        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Automatic Responses" description="Welcome, fallback, and keyword rules persisted in Supabase (bot_responses)."
              action={<Button size="sm" onClick={() => void saveResponses()} disabled={!responsesDirty || saving}><Save className="size-4" />{saving ? "Saving..." : "Save Responses"}</Button>} />
            <div className="grid grid-cols-1 gap-5 p-5 pt-2 md:grid-cols-2">
              <Field label="Welcome Message (/start fallback)" htmlFor="resp-welcome" counter={`${welcomeMessage.length} / 4096`}>
                <Textarea id="resp-welcome" maxLength={4096} rows={5} value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="Hello! How can I help you today?" />
              </Field>
              <Field label="Default Fallback Response" htmlFor="resp-default" counter={`${defaultResponse.length} / 4096`}>
                <Textarea id="resp-default" maxLength={4096} rows={5} value={defaultResponse} onChange={(e) => setDefaultResponse(e.target.value)} placeholder="Sorry, I didn't understand that. Type /help to see available commands." />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Keyword Auto-Replies"
              description="Instant canned responses triggered whenever an incoming message contains a matching keyword."
              action={
                <Button variant="outline" size="sm" onClick={() => setKeywordRules((r) => [...r, { matchType: "keyword", matchValue: "", responseText: "", priority: (r.length + 1) * 10, enabled: true }])}>
                  <Plus className="size-4" />Add Keyword Rule
                </Button>
              }
            />
            <div className="space-y-3 p-5 pt-2">
              {!responsesLoaded ? (
                <p className="text-sm text-muted">Loading response rules...</p>
              ) : keywordRules.length === 0 ? (
                <p className="panel p-5 text-center text-sm text-muted">
                  No keyword auto-replies yet. Click <strong>Add Keyword Rule</strong> to trigger instant replies on words like &ldquo;pricing&rdquo; or &ldquo;support&rdquo;.
                </p>
              ) : (
                keywordRules.map((rule, i) => (
                  <div key={rule.id ?? i} className="panel grid grid-cols-1 gap-3 p-3 md:grid-cols-[200px_1fr_95px_auto] md:items-center">
                    <Input
                      aria-label="Keyword trigger"
                      placeholder="Keyword (e.g. pricing)"
                      value={rule.matchValue}
                      onChange={(e) => setKeywordRules((all) => all.map((x, idx) => (idx === i ? { ...x, matchValue: e.target.value } : x)))}
                    />
                    <Input
                      aria-label="Keyword reply"
                      placeholder="Auto-reply message"
                      value={rule.responseText}
                      onChange={(e) => setKeywordRules((all) => all.map((x, idx) => (idx === i ? { ...x, responseText: e.target.value } : x)))}
                    />
                    <Input
                      aria-label="Rule priority"
                      type="number"
                      min={1}
                      max={1000}
                      value={String(rule.priority)}
                      onChange={(e) => setKeywordRules((all) => all.map((x, idx) => (idx === i ? { ...x, priority: Math.max(1, Number(e.target.value) || 100) } : x)))}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Switch label="Enabled" checked={rule.enabled} onCheckedChange={(v) => setKeywordRules((all) => all.map((x, idx) => (idx === i ? { ...x, enabled: v } : x)))} />
                      <button type="button" aria-label="Remove keyword rule" onClick={() => setKeywordRules((all) => all.filter((_, idx) => idx !== i))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-bad"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : tab === "knowledge" ? (
        <div className="space-y-5">
          <BotKnowledge botId={bot.id} demo={demo} />
          {details?.agent && (
            <Card>
              <CardHeader
                title="AI Agent Inline Knowledge Sources"
                description="Direct text notes stored in Supabase (ai_agent_knowledge) and injected into this bot's AI prompt."
                icon={<Sparkles />}
                action={<ButtonLink href={`/ai/agents/${details.agent.id}?step=3`} variant="outline" size="sm">Open in AI Studio</ButtonLink>}
              />
              <div className="space-y-4 p-5 pt-2">
                {details.agentKnowledge.length > 0 ? (
                  <ul className="space-y-2">
                    {details.agentKnowledge.map((k) => (
                      <li key={k.id} className="panel flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{k.title}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{k.content}</p>
                        </div>
                        <button type="button" aria-label={`Remove ${k.title}`} onClick={() => void removeAgentKnowledge(k.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-bad">
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="panel p-4 text-sm text-muted">No inline agent knowledge sources added yet.</p>
                )}

                <form onSubmit={addAgentKnowledge} className="panel space-y-3 p-4">
                  <p className="text-sm font-semibold">Add Inline Knowledge Source</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_1fr]">
                    <Input aria-label="Knowledge title" placeholder="Title (e.g. Refund Policy)" maxLength={120} value={knowTitle} onChange={(e) => setKnowTitle(e.target.value)} />
                    <Textarea aria-label="Knowledge content" rows={2} maxLength={20000} placeholder="Paste facts, FAQs, or instructions this bot should reference..." value={knowContent} onChange={(e) => setKnowContent(e.target.value)} />
                  </div>
                  <Button type="submit" size="sm" variant="subtle" disabled={knowBusy || !knowTitle.trim() || !knowContent.trim()}>
                    <Plus className="size-4" />{knowBusy ? "Saving..." : "Add Knowledge Source"}
                  </Button>
                </form>
              </div>
            </Card>
          )}
        </div>
      ) : tab === "automation" ? (
        <Card className="p-5">
          <CardHeader title="Linked Automations" description="Workflows in Supabase triggered by or sending messages through this Telegram bot."
            action={<ButtonLink href={`/workflows/new?botId=${bot.id}`} size="sm"><Plus className="size-4" />New Workflow</ButtonLink>} />
          <div className="p-5 pt-2">
            {!details ? <p className="text-sm text-muted">Loading workflows...</p> : details.workflows.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-muted">
                No workflows linked to this bot yet. <Link href={`/workflows/new?botId=${bot.id}`} className="font-semibold text-lavender underline">Create a workflow</Link> pre-configured for {bot.name}.
              </div>
            ) : (
              <div className="space-y-2.5">
                {details.workflows.map((w) => (
                  <Link key={w.id} href={`/workflows/${w.id}`} className="panel flex items-center justify-between gap-3 p-3.5 hover:border-lavender/60">
                    <div className="min-w-0">
                      <p className="font-semibold">{w.name}</p>
                      {w.description && <p className="truncate text-xs text-foreground/75">{w.description}</p>}
                      <p className="text-xs text-muted">Updated {new Date(w.updated_at).toLocaleString()}</p>
                    </div>
                    <Badge tone={w.status === "active" ? "success" : "neutral"} className="capitalize">{w.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : tab === "integrations" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h3 className="text-lg font-bold">Telegram Connection</h3>
              <dl className="space-y-2 text-sm">
                <div className="panel flex justify-between p-3"><dt className="text-muted">Webhook Status</dt><dd className="font-semibold capitalize">{bot.webhookStatus}</dd></div>
                <div className="panel flex justify-between p-3"><dt className="text-muted">Public Bot ID</dt><dd className="font-mono text-xs">{bot.publicId ?? bot.id}</dd></div>
                {bot.username && <div className="panel flex justify-between p-3"><dt className="text-muted">Telegram Link</dt><dd><a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-lavender hover:underline">t.me/{bot.username} <ExternalLink className="size-3.5" aria-hidden /></a></dd></div>}
              </dl>
            </Card>
            <Card className="p-5">
              <h3 className="text-lg font-bold">Rotate Bot Token</h3>
              <p className="mt-1 text-xs text-muted">If you revoked your token in @BotFather (/revoke), paste the new one here.</p>
              <form onSubmit={rotateToken} className="mt-3 space-y-3">
                <Input type="password" placeholder="123456789:AA..." value={newToken} onChange={(e) => setNewToken(e.target.value)} />
                <Button type="submit" disabled={!newToken.trim() || rotatingToken}><KeyRound className="size-4" />{rotatingToken ? "Verifying..." : "Update & Verify Token"}</Button>
              </form>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Connected Channel Integrations"
              description="Slack, Discord, and signed outbound webhooks stored in Supabase (integrations) that receive workspace & bot events."
              icon={<Plug />}
              action={<ButtonLink href="/integrations" variant="outline" size="sm"><Plus className="size-4" />Manage Integrations</ButtonLink>}
            />
            <div className="space-y-2.5 p-5 pt-2">
              {!details ? (
                <p className="text-sm text-muted">Loading integrations...</p>
              ) : details.integrations.length === 0 ? (
                <div className="panel p-5 text-center text-sm text-muted">
                  No outbound integrations connected yet. <Link href="/integrations" className="font-semibold text-lavender underline">Connect Slack, Discord, or a Custom Webhook</Link> to stream bot events.
                </div>
              ) : (
                details.integrations.map((item) => (
                  <div key={item.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.name}</span>
                        <Badge tone={item.status === "active" ? "success" : "neutral"} className="capitalize">{item.status}</Badge>
                        <Badge tone="primary" className="uppercase">{item.provider}</Badge>
                        {item.lastStatus && <span className="text-xs text-muted">Last: {item.lastStatus}</span>}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted">{item.targetPreview ?? "Encrypted target"} · {item.events.length} event(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={intBusyId === item.id} onClick={() => void runIntegrationTest(item.id)}>Test</Button>
                      <Switch label={`Toggle ${item.name}`} checked={item.status === "active"} onCheckedChange={(v) => void toggleIntegrationStatus(item.id, v)} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {details && details.webhookEndpoints.length > 0 && (
            <Card>
              <CardHeader title="Incoming Webhook Endpoints" description="Workflow webhook triggers stored in Supabase (webhook_endpoints)." icon={<Webhook />} />
              <div className="space-y-2 p-5 pt-2">
                {details.webhookEndpoints.map((ep) => (
                  <div key={ep.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{ep.workflowName}</p>
                      <code className="block truncate text-muted">{ep.url}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ep.enabled ? "success" : "neutral"}>{ep.enabled ? "Enabled" : "Paused"}</Badge>
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(ep.url); toast.success("Webhook URL copied"); }}><Copy className="size-3.5" />Copy</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : tab === "analytics" ? (
        <BotAnalyticsPanel
          botUsername={bot.username}
          data={details}
          range={analyticsRange}
          loading={detailsLoading}
          demo={demo}
          onRangeChange={(next) => {
            setAnalyticsRange(next);
            void loadDetails(next);
          }}
          onRefresh={() => void loadDetails(analyticsRange)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5 space-y-4">
            <h3 className="text-lg font-bold">Bot Controls</h3>
            <div className="panel flex items-center justify-between p-3">
              <div><p className="font-semibold">Active Status</p><p className="text-xs text-muted">Enable or pause incoming Telegram updates.</p></div>
              <Switch label="Bot active" checked={active} onCheckedChange={toggle} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void revalidate()} disabled={revalidating}><RefreshCw className="size-4" />Re-validate Telegram</Button>
              <Button variant="outline" onClick={() => void syncTelegramPhoto()} disabled={photoBusy}><Camera className="size-4" />Sync Telegram Photo</Button>
            </div>
          </Card>
          <Card className="border-danger/40 p-5 space-y-3">
            <h3 className="text-lg font-bold text-bad">Danger Zone</h3>
            <p className="text-sm text-foreground/80">Permanently delete &ldquo;{bot.name}&rdquo;, clear its Telegram webhook, commands, description &amp; photo, and save a snapshot to Bot History.</p>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" />Delete Bot</Button>
          </Card>

          {details?.agent && (
            <Card className="lg:col-span-2 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconTile tone="primary" size="sm"><Sparkles /></IconTile>
                  <div>
                    <h3 className="text-base font-bold">AI Agent Runtime Settings</h3>
                    <p className="text-xs text-muted">
                      Saved in Supabase (ai_agents) · Model: {details.agent.modelName ?? "Unset"} · Temp {details.agent.temperature} · Max {details.agent.maxTokens} tokens · Memory {details.agent.memoryTurns} turns
                    </p>
                  </div>
                </div>
                <ButtonLink href={`/ai/agents/${details.agent.id}`} variant="outline" size="sm">Full Agent Settings</ButtonLink>
              </div>
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {AGENT_TOOL_LABELS.map((item) => (
                  <li key={item.key} className="panel flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted">{item.body}</p>
                    </div>
                    <Switch
                      label={item.title}
                      checked={details.agent!.tools[item.key]}
                      disabled={agentToolBusy === item.key}
                      onCheckedChange={(v) => void toggleAgentTool(item.key, v)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {initialHistory.length > 0 && (
            <Card className="lg:col-span-2 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <IconTile tone="primary" size="sm"><History /></IconTile>
                <div>
                  <h3 className="text-base font-bold">Bot Configuration &amp; Lifecycle Record</h3>
                  <p className="text-xs text-muted">Audit snapshot stored in Supabase (bot_history) of what this bot is configured and used for.</p>
                </div>
              </div>
              <ul className="space-y-2">
                {initialHistory.map((h) => (
                  <li key={h.id} className="panel flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                    <div>
                      <span className="font-bold text-foreground capitalize">{h.event.replaceAll("_", " ")}</span>
                      {" — "}
                      <span className="text-foreground/85">{h.usedFor}</span>
                    </div>
                    <span className="text-muted">{new Date(h.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Test Bot" icon={<Play />}
        footer={<><Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button><Button onClick={runTest} disabled={testBusy || !testMsg.trim()}><Send className="size-4" />{testBusy ? "Running..." : testChatId.trim() ? "Send on Telegram" : "Simulate Reply"}</Button></>}>
        <form onSubmit={runTest} className="space-y-3">
          <Field label="Message or Command" htmlFor="test-msg"><Input id="test-msg" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="/start" /></Field>
          <Field label="Telegram Chat ID (optional)" htmlFor="test-chat" hint="Leave empty to simulate locally, or enter your Telegram user/chat ID to send a real message.">
            <Input id="test-chat" value={testChatId} onChange={(e) => setTestChatId(e.target.value)} placeholder="e.g. 123456789" />
          </Field>
          {testResult && (
            <div className="panel p-3 text-sm">
              <p className="text-xs font-bold uppercase text-muted">{testResult.mode === "telegram" ? "Sent to Telegram" : "Simulated Bot Reply"}</p>
              <p className="mt-1 whitespace-pre-wrap">{testResult.reply}</p>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Bot & Clean Up Telegram?"
        icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={<><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={remove}><Trash2 className="size-4" />Delete Bot Now</Button></>}
      >
        <div className="space-y-2 text-sm text-foreground/85">
          <p>
            Are you sure you want to delete &ldquo;{bot.name}&rdquo;{bot.username && <> (@{bot.username})</>}?
          </p>
          <p className="text-xs leading-relaxed text-muted">
            This clears the webhook, pending updates, menu commands, descriptions, and profile photo on Telegram, permanently deletes the bot from RelayNest, and logs its configuration snapshot in Bot Lifecycle History. (If you also want to delete the @handle permanently on Telegram, use /deletebot inside @BotFather.)
          </p>
        </div>
      </Modal>
    </div>
  );
}
