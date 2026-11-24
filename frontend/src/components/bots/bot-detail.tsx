"use client";

import {
  AlertTriangle, BarChart3, BookOpen, Calendar, Camera, Check, CheckCircle2, Code2, Copy, ExternalLink, Eye, EyeOff, History, KeyRound, Link2, MessageSquare,
  MoreVertical, Play, Plug, Plus, Power, RefreshCw, Save, Send, Settings, Trash2, Upload, Users, Workflow, Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS } from "@backend/lib/supabase/storage";
import { BotAvatar } from "@/components/bots/bot-avatar";
import { BotKnowledge } from "@/components/knowledge/bot-knowledge";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Textarea } from "@/components/ui/input";
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

interface BotCmd { id?: string; command: string; description: string; responseText: string; enabled: boolean }
interface BotDetailsPayload {
  workflows: { id: string; name: string; status: string; updated_at: string }[];
  executions: { id: string; trigger_type: string; status: string; duration_ms: number | null; started_at: string }[];
  logs: { id: string; action: string; detail: string | null; created_at: string }[];
}

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

  // Automation / Analytics tab data
  const [details, setDetails] = React.useState<BotDetailsPayload | null>(null);

  const dirty = name !== bot.name || description !== bot.description || category !== bot.category;
  const responsesDirty = welcomeMessage !== (bot.welcomeMessage ?? "") || defaultResponse !== (bot.defaultResponse ?? "");
  const connected = bot.webhookStatus === "registered" || bot.webhookStatus === "polling";

  async function call<T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false }> {
    if (demo) { toast.error("Demo mode: connect Supabase to save changes."); return { ok: false }; }
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error?.message ?? "Request failed."); return { ok: false }; }
    return { ok: true, data: j.data as T };
  }

  React.useEffect(() => {
    if (demo || cmdsLoaded || (tab !== "commands" && tab !== "analytics")) return;
    fetch(`/api/v1/bots/${bot.id}/commands`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) setCmds((j.data as { id: string; command: string; description: string | null; responseText: string; enabled: boolean }[]).map((c) => ({
          id: c.id, command: c.command, description: c.description ?? "", responseText: c.responseText, enabled: c.enabled,
        })));
        setCmdsLoaded(true);
      })
      .catch(() => setCmdsLoaded(true));
  }, [bot.id, demo, tab, cmdsLoaded]);

  React.useEffect(() => {
    if (demo || details || (tab !== "automation" && tab !== "analytics")) return;
    fetch(`/api/v1/bots/${bot.id}/details`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data) setDetails(j.data as BotDetailsPayload); })
      .catch(() => {});
  }, [bot.id, demo, tab, details]);

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
    setSaving(true);
    const r = await call<{ welcomeMessage: string | null; defaultResponse: string | null }>(`/api/v1/bots/${bot.id}`, "PATCH", { welcomeMessage, defaultResponse });
    setSaving(false);
    if (r.ok) {
      setBot((b) => ({ ...b, welcomeMessage: r.data.welcomeMessage ?? "", defaultResponse: r.data.defaultResponse ?? "" }));
      toast.success("Responses saved");
      router.refresh();
    }
  }

  async function saveCommands() {
    if (cmds.some((c) => !c.command.trim() || !c.responseText.trim())) {
      toast.error("Every command needs a name and a response.");
      return;
    }
    setCmdsBusy(true);
    const r = await call<{ commands: BotCmd[]; synced: boolean }>(`/api/v1/bots/${bot.id}/commands`, "PUT", {
      commands: cmds.map((c) => ({ command: c.command.replace(/^\//, ""), description: c.description, responseText: c.responseText, enabled: c.enabled })),
    });
    setCmdsBusy(false);
    if (r.ok) {
      toast.success(r.data.synced ? "Commands saved and synced to Telegram" : "Commands saved in database");
      router.refresh();
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
      // Telegram's setMyProfilePhoto requires a JPEG image; convert PNG/WebP to JPEG in the browser.
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
          </div>
          <p className="mt-1 text-[15px] text-foreground/85">{bot.username ? `@${bot.username}` : "No Telegram username yet"}</p>
          <p className="text-sm text-muted">Telegram Bot &middot; Created {bot.createdAt}</p>
        </div>
        <dl className="flex flex-wrap gap-3">
          {stat(MessageSquare, bot.messages, "Messages")}
          {stat(Users, bot.activeUsers, "Active Users")}
          {stat(Zap, details?.executions.length ?? bot.messages, "Executions")}
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
                  <Field label="Description" htmlFor="b-desc" counter={`${description.length} / 200`}><Textarea id="b-desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" /></Field>
                </div>
              </div>
              <div className="grid-cols-1 grid gap-4 md:grid-cols-2">
                <Field label="Telegram Username" htmlFor="b-user" required>
                  <Input id="b-user" readOnly value={bot.username ? `@${bot.username}` : ""} trailing={
                    <button type="button" aria-label="Copy username" onClick={() => { navigator.clipboard?.writeText(`@${bot.username}`); setCopied(true); toast.success("Username copied"); setTimeout(() => setCopied(false), 1500); }} className="grid-cols-1 grid size-7 place-items-center rounded text-muted hover:text-foreground">
                      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                    </button>} />
                </Field>
                <Field label="Category (Optional)" htmlFor="b-cat" counter={`${category.length} / 50`}><Input id="b-cat" maxLength={50} value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
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
                <div className="flex items-center gap-2.5 text-foreground/85"><Users className="size-4 text-lavender" aria-hidden /><dt className="sr-only">Active users</dt><dd>{bot.activeUsers.toLocaleString()} Active Users</dd></div>
                <div className="flex items-center gap-2.5 text-foreground/85"><MessageSquare className="size-4 text-lavender" aria-hidden /><dt className="sr-only">Messages</dt><dd>{bot.messages.toLocaleString()} Messages Processed</dd></div>
              </dl>
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Power className="size-5 text-lavender" aria-hidden />Quick Actions</h2>
              <div className="grid-cols-1 mt-3 grid grid-cols-2 gap-2.5">
                {[
                  { t: "Test Bot", d: "Send a test message", I: Play, action: () => { setTestResult(null); setTestOpen(true); } },
                  { t: "View Analytics", d: "Usage & performance", I: BarChart3, action: () => setTab("analytics") },
                  { t: "Manage Commands", d: "Add or edit commands", I: Code2, action: () => setTab("commands") },
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
          <CardHeader title="Bot Commands" description="Slash commands shown in Telegram's menu and handled automatically."
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCmds((c) => [...c, { command: "", description: "", responseText: "", enabled: true }])}><Plus className="size-4" />Add Command</Button>
                <Button size="sm" onClick={() => void saveCommands()} disabled={cmdsBusy}><Save className="size-4" />{cmdsBusy ? "Syncing..." : "Save & Sync to Telegram"}</Button>
              </div>
            } />
          {!cmdsLoaded ? <p className="p-5 text-sm text-muted">Loading commands...</p> : cmds.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No commands yet. Click Add Command to create /start, /help, or custom commands.</p>
          ) : (
            <div className="space-y-3 p-5 pt-2">
              {cmds.map((c, i) => (
                <div key={i} className="panel grid grid-cols-1 gap-3 p-3 md:grid-cols-[160px_1fr_1.4fr_auto] md:items-center">
                  <Input aria-label="Command name" placeholder="start" value={c.command} onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, command: e.target.value } : x)))} />
                  <Input aria-label="Command description" placeholder="Menu description" value={c.description} onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))} />
                  <Input aria-label="Command response" placeholder="Reply text" value={c.responseText} onChange={(e) => setCmds((all) => all.map((x, idx) => (idx === i ? { ...x, responseText: e.target.value } : x)))} />
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
        <Card className="p-5">
          <CardHeader title="Automatic Responses" description="Messages sent when a user starts the bot or sends an unknown message."
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
      ) : tab === "knowledge" ? (
        <BotKnowledge botId={bot.id} demo={demo} />
      ) : tab === "automation" ? (
        <Card className="p-5">
          <CardHeader title="Linked Automations" description="Workflows triggered by this Telegram bot."
            action={<ButtonLink href="/workflows/new" size="sm"><Plus className="size-4" />New Workflow</ButtonLink>} />
          <div className="p-5 pt-2">
            {!details ? <p className="text-sm text-muted">Loading workflows...</p> : details.workflows.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-muted">
                No workflows linked to this bot yet. <Link href="/workflows/new" className="font-semibold text-lavender underline">Create a workflow</Link> and choose this bot in its trigger.
              </div>
            ) : (
              <div className="space-y-2.5">
                {details.workflows.map((w) => (
                  <Link key={w.id} href={`/workflows/${w.id}`} className="panel flex items-center justify-between p-3 hover:border-lavender/60">
                    <div><p className="font-semibold">{w.name}</p><p className="text-xs text-muted">Updated {new Date(w.updated_at).toLocaleString()}</p></div>
                    <Badge tone={w.status === "active" ? "success" : "neutral"} className="capitalize">{w.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : tab === "integrations" ? (
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
      ) : tab === "analytics" ? (
        <Card className="p-5">
          <CardHeader title="Bot Activity & Executions" description="Recent runs and messages for this bot." />
          <div className="p-5 pt-2">
            {!details ? <p className="text-sm text-muted">Loading activity...</p> : details.executions.length === 0 ? (
              <p className="panel p-6 text-center text-sm text-muted">No executions recorded for this bot yet. Send a message to @{bot.username || "your bot"} on Telegram to test.</p>
            ) : (
              <table className="rn-table">
                <thead><tr><th>Trigger</th><th>Status</th><th>Duration</th><th>Started</th></tr></thead>
                <tbody>
                  {details.executions.map((ex) => (
                    <tr key={ex.id}>
                      <td className="capitalize">{ex.trigger_type}</td>
                      <td><Badge tone={ex.status === "succeeded" ? "success" : ex.status === "failed" ? "danger" : "neutral"} className="capitalize">{ex.status}</Badge></td>
                      <td className="tabular-nums">{ex.duration_ms ? `${ex.duration_ms} ms` : "-"}</td>
                      <td className="text-xs text-muted">{new Date(ex.started_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
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
          {initialHistory.length > 0 && (
            <Card className="lg:col-span-2 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <IconTile tone="primary" size="sm"><History /></IconTile>
                <div>
                  <h3 className="text-base font-bold">Bot Configuration &amp; Lifecycle Record</h3>
                  <p className="text-xs text-muted">Audit snapshot of what this bot is configured and used for.</p>
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
