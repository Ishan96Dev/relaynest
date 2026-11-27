"use client";
/* Agent avatars can be local Supabase Storage URLs, so next/image optimization is unnecessary. */
/* eslint-disable @next/next/no-img-element */

import { BrainCircuit, Camera, ExternalLink, Save, SlidersHorizontal, Upload } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS, publicStorageUrl } from "@backend/lib/supabase/storage";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import type { AiAgentDto } from "@backend/server/services/ai-agents";
import { CATEGORIES, DESC_MAX, INSTRUCTIONS_MIN, LANGUAGES } from "@/components/bots/ai-agent-steps";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";

interface EditAgentModalProps {
  agent: AiAgentDto | null;
  models?: ModelDto[];
  demo?: boolean;
  onClose: () => void;
  onSaved: (updated: AiAgentDto) => void;
}

/** Quick-edit modal for existing AI Agents from My Bots and AI Agents pages (persisted to Supabase + synced to Telegram bot). */
export function EditAgentModal({ agent, models = [], demo = false, onClose, onSaved }: EditAgentModalProps) {
  const [baseline, setBaseline] = React.useState<AiAgentDto | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("Community Manager");
  const [language, setLanguage] = React.useState("English");
  const [modelSlug, setModelSlug] = React.useState<string>("");
  const [instructions, setInstructions] = React.useState("");
  const [welcomeMessage, setWelcomeMessage] = React.useState("");
  const [fallbackMessage, setFallbackMessage] = React.useState("");
  const [avatarPath, setAvatarPath] = React.useState<string | null>(null);
  const [hydrating, setHydrating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [errs, setErrs] = React.useState<{ name?: string; description?: string; instructions?: string }>({});
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!agent) {
      setBaseline(null);
      return;
    }
    setBaseline(agent);
    setName(agent.name);
    setDescription(agent.description);
    setCategory(agent.category);
    setLanguage(agent.language);
    setModelSlug(agent.modelSlug ?? "");
    setInstructions(agent.instructions);
    setWelcomeMessage(agent.welcomeMessage ?? "");
    setFallbackMessage(agent.fallbackMessage ?? "");
    setAvatarPath(agent.avatarPath ?? null);
    setErrs({});

    if (demo) return;
    const ctrl = new AbortController();
    setHydrating(true);
    fetch(`/api/v1/ai-agents/${agent.id}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const fresh = j?.data as AiAgentDto | undefined;
        if (!fresh) return;
        setBaseline(fresh);
        setName(fresh.name);
        setDescription(fresh.description);
        setCategory(fresh.category);
        setLanguage(fresh.language);
        setModelSlug(fresh.modelSlug ?? "");
        setInstructions(fresh.instructions);
        setWelcomeMessage(fresh.welcomeMessage ?? "");
        setFallbackMessage(fresh.fallbackMessage ?? "");
        setAvatarPath(fresh.avatarPath ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setHydrating(false);
      });
    return () => ctrl.abort();
  }, [agent, demo]);

  const refAgent = baseline ?? agent;
  const dirty = Boolean(
    refAgent &&
      (name !== refAgent.name ||
        description !== refAgent.description ||
        category !== refAgent.category ||
        language !== refAgent.language ||
        (modelSlug || null) !== refAgent.modelSlug ||
        instructions !== refAgent.instructions ||
        welcomeMessage !== (refAgent.welcomeMessage ?? "") ||
        fallbackMessage !== (refAgent.fallbackMessage ?? "") ||
        avatarPath !== refAgent.avatarPath),
  );

  const avatarUrl = publicStorageUrl(BUCKETS.avatars, avatarPath);

  async function uploadAvatar(file: File) {
    if (!agent) return;
    if (demo) { toast.error("Demo mode: connect Supabase to upload an avatar."); return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Use PNG, JPG or WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2 MB."); return; }
    setPhotoBusy(true);
    try {
      const sb = await createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { toast.error("Your session expired. Sign in again."); return; }
      const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      const path = `${session.user.id}/agent-${Date.now()}.${ext}`;
      const up = await sb.storage.from(BUCKETS.avatars).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (up.error) { toast.error(`Could not upload image: ${up.error.message}`); return; }
      setAvatarPath(path);
      toast.info("Photo staged. Click Save Changes to apply.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!agent) return;
    if (demo) { toast.error("Demo mode: connect Supabase to edit AI agents."); return; }

    const nextErrs: { name?: string; description?: string; instructions?: string } = {};
    if (!name.trim()) nextErrs.name = "Enter an agent name.";
    if (!description.trim()) nextErrs.description = "Describe what your agent does.";
    if (instructions.trim().length > 0 && instructions.trim().length < INSTRUCTIONS_MIN) {
      nextErrs.instructions = `Add a little more detail (${INSTRUCTIONS_MIN - instructions.trim().length} more characters).`;
    }
    setErrs(nextErrs);
    if (Object.keys(nextErrs).length > 0) return;

    setSaving(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      category,
      language,
      instructions,
      welcomeMessage: welcomeMessage.trim() || null,
      fallbackMessage: fallbackMessage.trim() || null,
    };
    if (models.length > 0) {
      body.modelSlug = modelSlug || null;
    }
    if (avatarPath !== agent.avatarPath) {
      body.avatarPath = avatarPath;
    }

    const r = await api<AiAgentDto>(`/api/v1/ai-agents/${agent.id}`, {
      method: "PATCH",
      body,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    if (avatarPath !== agent.avatarPath && agent.avatarPath && !agent.avatarPath.startsWith("bots/")) {
      const sb = await createClient();
      void sb.storage.from(BUCKETS.avatars).remove([agent.avatarPath]);
    }
    onSaved(r.data);
    toast.success("AI Agent updated and synced");
    onClose();
  }

  const categoryChoices = agent && !CATEGORIES.includes(agent.category) ? [agent.category, ...CATEGORIES] : CATEGORIES;
  const languageChoices = agent && !LANGUAGES.includes(agent.language) ? [agent.language, ...LANGUAGES] : LANGUAGES;

  return (
    <Modal
      open={Boolean(agent)}
      onClose={onClose}
      title={`Edit AI Agent${agent ? `: ${agent.name}` : ""}`}
      icon={<IconTile tone="primary" size="md"><BrainCircuit /></IconTile>}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      {agent && (
        <form onSubmit={handleSave} className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/25 text-lavender ring-1 ring-inset ring-primary/40">
                  {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <BrainCircuit className="size-7" aria-hidden />}
                </span>
                <button
                  type="button"
                  aria-label="Upload agent avatar"
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
                <p className="truncate font-bold text-foreground">@{agent.username}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-lavender hover:underline disabled:opacity-50"
                  >
                    <Upload className="size-3" aria-hidden />{photoBusy ? "Uploading..." : "Upload photo"}
                  </button>
                  {agent.botId && (
                    <>
                      <span className="text-muted">&middot;</span>
                      <Link href={`/bots/${agent.botId}`} onClick={onClose} className="text-xs font-semibold text-muted hover:text-foreground">
                        Open in My Bots &rarr;
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={agent.status === "active" ? "success" : agent.status === "error" ? "danger" : agent.status === "draft" ? "warning" : "neutral"} dot className="capitalize">
                {agent.status}
              </Badge>
              {agent.botId && (
                <a
                  href={`https://t.me/${agent.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:border-lavender/60"
                >
                  <ExternalLink className="size-3" aria-hidden />Telegram
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Agent Name" htmlFor="edit-agent-name" required error={errs.name} counter={`${name.length} / 50`}>
              <Input
                id="edit-agent-name"
                maxLength={50}
                value={name}
                onChange={(e) => { setName(e.target.value); setErrs((x) => ({ ...x, name: undefined })); }}
              />
            </Field>
            {models.length > 0 ? (
              <Field label="AI Model" htmlFor="edit-agent-model">
                <Select id="edit-agent-model" value={modelSlug} onChange={(e) => setModelSlug(e.target.value)}>
                  <option value="">No model selected</option>
                  {models.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.name} ({m.providerName})</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Primary Language" htmlFor="edit-agent-lang-inline">
                <Select id="edit-agent-lang-inline" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {languageChoices.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <div className={models.length > 0 ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : ""}>
            <Field label="Category" htmlFor="edit-agent-category">
              <Select id="edit-agent-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryChoices.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            {models.length > 0 && (
              <Field label="Primary Language" htmlFor="edit-agent-language">
                <Select id="edit-agent-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {languageChoices.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <Field label="Description" htmlFor="edit-agent-desc" required error={errs.description} counter={`${description.length} / ${DESC_MAX}`}>
            <Textarea
              id="edit-agent-desc"
              rows={2}
              maxLength={DESC_MAX}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setErrs((x) => ({ ...x, description: undefined })); }}
            />
          </Field>

          <Field label="Instructions (System Prompt)" htmlFor="edit-agent-instructions" error={errs.instructions} counter={`${instructions.length} / 8000`}>
            <Textarea
              id="edit-agent-instructions"
              rows={4}
              maxLength={8000}
              placeholder="Tell your agent who it is, how to answer, and what rules to follow..."
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); setErrs((x) => ({ ...x, instructions: undefined })); }}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Welcome Message (/start)" htmlFor="edit-agent-welcome" counter={`${welcomeMessage.length} / 4096`}>
              <Textarea
                id="edit-agent-welcome"
                rows={2}
                maxLength={4096}
                placeholder="Hi! Ask me anything."
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </Field>
            <Field label="Fallback Message" htmlFor="edit-agent-fallback" counter={`${fallbackMessage.length} / 4096`}>
              <Textarea
                id="edit-agent-fallback"
                rows={2}
                maxLength={4096}
                placeholder="Sorry, I couldn't answer right now."
                value={fallbackMessage}
                onChange={(e) => setFallbackMessage(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
            <ButtonLink href={`/ai/agents/${agent.id}`} variant="ghost" size="sm" onClick={onClose}>
              <SlidersHorizontal className="size-3.5" aria-hidden />Full Wizard (Knowledge, Tools &amp; Commands)
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
