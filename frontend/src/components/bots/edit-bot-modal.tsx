"use client";

import { Bot as BotIcon, Camera, ExternalLink, RefreshCw, Save, Settings, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS } from "@backend/lib/supabase/storage";
import { BotAvatar } from "@/components/bots/bot-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { Bot } from "@/types";

interface EditBotModalProps {
  bot: Bot | null;
  demo?: boolean;
  onClose: () => void;
  onSaved: (updated: Bot) => void;
}

/** Quick-edit modal for existing Telegram bots directly inside My Bots (persisted to Supabase + synced with Telegram & linked AI Agent). */
export function EditBotModal({ bot, demo = false, onClose, onSaved }: EditBotModalProps) {
  const [baseline, setBaseline] = React.useState<Bot | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [welcomeMessage, setWelcomeMessage] = React.useState("");
  const [defaultResponse, setDefaultResponse] = React.useState("");
  const [avatarPath, setAvatarPath] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(false);
  const [hydrating, setHydrating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [nameErr, setNameErr] = React.useState<string>();
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!bot) {
      setBaseline(null);
      return;
    }
    setBaseline(bot);
    setName(bot.name);
    setDescription(bot.description ?? "");
    setCategory(bot.category ?? "");
    setWelcomeMessage(bot.welcomeMessage ?? "");
    setDefaultResponse(bot.defaultResponse ?? "");
    setAvatarPath(bot.avatarPath ?? null);
    setActive(bot.status === "active");
    setNameErr(undefined);

    if (demo) return;
    const ctrl = new AbortController();
    setHydrating(true);
    fetch(`/api/v1/bots/${bot.id}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.data as {
          name: string;
          description: string | null;
          category: string | null;
          welcomeMessage: string | null;
          defaultResponse: string | null;
          avatarPath: string | null;
          status: Bot["status"];
          webhookStatus: Bot["webhookStatus"];
          username: string | null;
        } | undefined;
        if (!d) return;
        const fresh: Bot = {
          ...bot,
          name: d.name,
          description: d.description ?? "",
          category: d.category ?? "",
          welcomeMessage: d.welcomeMessage ?? "",
          defaultResponse: d.defaultResponse ?? "",
          avatarPath: d.avatarPath ?? null,
          status: d.status,
          webhookStatus: d.webhookStatus,
          username: d.username ?? bot.username,
        };
        setBaseline(fresh);
        setName(fresh.name);
        setDescription(fresh.description);
        setCategory(fresh.category);
        setWelcomeMessage(fresh.welcomeMessage ?? "");
        setDefaultResponse(fresh.defaultResponse ?? "");
        setAvatarPath(fresh.avatarPath ?? null);
        setActive(fresh.status === "active");
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setHydrating(false);
      });
    return () => ctrl.abort();
  }, [bot, demo]);

  const refBot = baseline ?? bot;
  const textDirty = Boolean(
    refBot &&
      (name !== refBot.name ||
        description !== (refBot.description ?? "") ||
        category !== (refBot.category ?? "") ||
        welcomeMessage !== (refBot.welcomeMessage ?? "") ||
        defaultResponse !== (refBot.defaultResponse ?? "")),
  );
  const statusDirty = Boolean(refBot && active !== (refBot.status === "active"));
  const dirty = textDirty || statusDirty;

  async function uploadAvatar(file: File) {
    if (!bot) return;
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
      const res = await fetch(`/api/v1/bots/${bot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarPath: path }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast.error(j?.error?.message ?? "Failed to save avatar."); return; }
      const nextPath = (j?.data?.avatarPath as string | null | undefined) ?? path;
      setAvatarPath(nextPath);
      onSaved({ ...bot, avatarPath: nextPath });
      toast.success("Bot avatar updated & synced to Telegram");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function syncTelegramPhoto() {
    if (!bot) return;
    if (demo) { toast.error("Demo mode: connect Supabase to sync photo."); return; }
    setPhotoBusy(true);
    try {
      const res = await fetch(`/api/v1/bots/${bot.id}/photo`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast.error(j?.error?.message ?? "Could not sync photo."); return; }
      if (j?.data?.synced) {
        const nextPath = (j.data.bot?.avatarPath as string | null) ?? null;
        setAvatarPath(nextPath);
        onSaved({ ...bot, avatarPath: nextPath });
        toast.success("Synced bot photo from Telegram");
      } else {
        toast.info(j?.data?.message ?? "No profile photo set on Telegram yet.");
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!bot) return;
    if (demo) { toast.error("Demo mode: connect Supabase to edit bots."); return; }
    if (!name.trim()) {
      setNameErr("Enter a bot name.");
      return;
    }
    setSaving(true);
    try {
      let nextBot: Bot = { ...bot, avatarPath };
      if (textDirty) {
        const res = await fetch(`/api/v1/bots/${bot.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            category: category.trim(),
            welcomeMessage: welcomeMessage.trim(),
            defaultResponse: defaultResponse.trim(),
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(j?.error?.message ?? "Could not update bot.");
          return;
        }
        const d = j.data as {
          name: string;
          description: string | null;
          category: string | null;
          welcomeMessage: string | null;
          defaultResponse: string | null;
          avatarPath: string | null;
        };
        nextBot = {
          ...nextBot,
          name: d.name,
          description: d.description ?? "",
          category: d.category ?? "",
          welcomeMessage: d.welcomeMessage ?? "",
          defaultResponse: d.defaultResponse ?? "",
          avatarPath: d.avatarPath ?? nextBot.avatarPath,
        };
      }

      if (statusDirty) {
        const endpoint = active ? "activate" : "deactivate";
        const res = await fetch(`/api/v1/bots/${bot.id}/${endpoint}`, { method: "POST" });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(j?.error?.message ?? `Could not ${active ? "activate" : "pause"} bot.`);
          return;
        }
        nextBot = {
          ...nextBot,
          status: j.data.status as Bot["status"],
          webhookStatus: j.data.webhookStatus as Bot["webhookStatus"],
          linkedAgentStatus: nextBot.linkedAgentId ? (j.data.status as Bot["status"]) : nextBot.linkedAgentStatus,
        };
      }

      onSaved(nextBot);
      toast.success("Bot updated and synced with Supabase & Telegram");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(bot)}
      onClose={onClose}
      title={`Edit Bot${bot ? `: ${bot.name}` : ""}`}
      icon={<IconTile tone="primary" size="md"><BotIcon /></IconTile>}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      {bot && (
        <form onSubmit={handleSave} className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <BotAvatar name={name || bot.name} avatarPath={avatarPath} className="size-14 rounded-xl" />
                <button
                  type="button"
                  aria-label="Upload bot avatar"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-md bg-primary text-white shadow transition hover:brightness-110 disabled:opacity-50"
                >
                  <Camera className="size-3" />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadAvatar(f);
                }}
              />
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{bot.username ? `@${bot.username}` : "Telegram Bot"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-lavender hover:underline disabled:opacity-50"
                  >
                    <Upload className="size-3" aria-hidden />{photoBusy ? "Uploading..." : "Upload photo"}
                  </button>
                  <span className="text-muted">&middot;</span>
                  <button
                    type="button"
                    onClick={() => void syncTelegramPhoto()}
                    disabled={photoBusy}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={photoBusy ? "size-3 animate-spin" : "size-3"} aria-hidden />Sync Telegram photo
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bot.linkedAgentId && (
                <Badge tone="primary">
                  <Sparkles className="size-3" aria-hidden />
                  {bot.linkedAgentModelName ? `AI: ${bot.linkedAgentModelName}` : "AI Agent"}
                </Badge>
              )}
              {bot.username && (
                <a
                  href={`https://t.me/${bot.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:border-lavender/60"
                >
                  <ExternalLink className="size-3" aria-hidden />Telegram
                </a>
              )}
            </div>
          </div>

          {bot.linkedAgentId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-2.5 text-xs">
              <span className="text-foreground/85">
                This bot is powered by an <span className="font-semibold text-foreground">AI Agent</span>. Identity &amp; messages stay synced automatically.
              </span>
              <Link
                href={`/ai/agents/${bot.linkedAgentId}`}
                onClick={onClose}
                className="font-semibold text-lavender hover:underline"
              >
                Edit AI Model &amp; Prompt &rarr;
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bot Name" htmlFor="edit-bot-name" required error={nameErr} counter={`${name.length} / 50`}>
              <Input
                id="edit-bot-name"
                maxLength={50}
                value={name}
                onChange={(e) => { setName(e.target.value); setNameErr(undefined); }}
              />
            </Field>
            <Field label="Category" htmlFor="edit-bot-category" counter={`${category.length} / 60`}>
              <Input
                id="edit-bot-category"
                maxLength={60}
                placeholder="e.g. Customer Support, Community"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="edit-bot-desc" counter={`${description.length} / 300`}>
            <Textarea
              id="edit-bot-desc"
              rows={2}
              maxLength={300}
              placeholder="Describe what your bot does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Welcome Message (/start)" htmlFor="edit-bot-welcome" counter={`${welcomeMessage.length} / 4096`}>
              <Textarea
                id="edit-bot-welcome"
                rows={3}
                maxLength={4096}
                placeholder="Hi! How can I help you today?"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </Field>
            <Field label="Default Fallback Response" htmlFor="edit-bot-default" counter={`${defaultResponse.length} / 4096`}>
              <Textarea
                id="edit-bot-default"
                rows={3}
                maxLength={4096}
                placeholder="Sorry, I didn't understand that."
                value={defaultResponse}
                onChange={(e) => setDefaultResponse(e.target.value)}
              />
            </Field>
          </div>

          <div className="panel flex items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Bot Active Status</p>
              <p className="text-xs text-muted">
                {active ? "Online and receiving incoming Telegram messages." : "Paused and ignoring incoming Telegram messages."}
              </p>
            </div>
            <Switch label="Bot active" checked={active} onCheckedChange={setActive} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
            <ButtonLink href={`/bots/${bot.id}`} variant="ghost" size="sm" onClick={onClose}>
              <Settings className="size-3.5" aria-hidden />Commands, Token &amp; Full Settings
            </ButtonLink>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!dirty || saving || hydrating}>
                <Save className="size-3.5" aria-hidden />{saving ? "Saving..." : hydrating ? "Syncing..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
