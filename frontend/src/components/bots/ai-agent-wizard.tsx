"use client";
import { ArrowLeft, ArrowRight, BrainCircuit, Check, ChevronRight, Eye, FolderOpen, Globe, Layers, Save, Sparkles, Users, X, XCircle, Bot, AlertCircle } from "lucide-react";
/* The avatar preview can be a local blob URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { DEFAULT_TOOLS } from "@backend/server/ai/agent";
import type { CitationSource } from "@backend/server/ai/citations";
import type { AgenticPayload } from "@backend/server/ai/market-data-types";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import type { WebMediaPayload } from "@backend/server/ai/web-search-types";
import type { AiAgentDto, KnowledgeDto } from "@backend/server/services/ai-agents";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS, publicStorageUrl } from "@backend/lib/supabase/storage";
import { ImportPicker } from "@/components/bots/import-picker";
import { TelegramPreview } from "@/components/bots/telegram-preview";
import {
  StepBasics, StepKnowledge, StepModel, StepReview, StepTelegram, StepTools,
  INSTRUCTIONS_MIN, validateCommands, type AgentForm, type FieldErrors,
} from "@/components/bots/ai-agent-steps";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NO_PENDING, type PendingImage } from "@/components/ui/file-upload";
import { IconTile } from "@/components/ui/icon-tile";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { AGENT_TEMPLATES, parseAgentImport, type AgentPreset } from "@/lib/agent-templates";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Connect Telegram", title: "Connect Your Telegram Bot", sub: "Start by connecting the bot you made in BotFather. Its name, username and photo are imported for you." },
  { label: "Basic Information", title: "Configure Your AI Agent", sub: "Refine the identity imported from Telegram and describe what your agent does." },
  { label: "AI Configuration", title: "Choose Your AI Model", sub: "Pick the model that powers your agent and how it answers." },
  { label: "Knowledge & Instructions", title: "Teach Your Agent", sub: "Write instructions and add the knowledge it should use." },
  { label: "Tools & Capabilities", title: "Tools & Capabilities", sub: "Choose how your agent remembers and behaves in chats." },
  { label: "Review & Create", title: "Review & Create", sub: "Check everything, test the agent, then go live." },
] as const;

const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$/;

/** relaynest_assistant_bot from "RelayNest Assistant". */
function suggestUsername(name: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_?bot$/, "").slice(0, 27);
  return base ? `${base}_bot` : "";
}

const fromAgent = (a: AiAgentDto): AgentForm => ({
  name: a.name, username: a.username, description: a.description, language: a.language, category: a.category, modelSlug: a.modelSlug,
  imageModelSlug: a.imageModelSlug, commands: a.commands,
  temperature: a.temperature, maxTokens: a.maxTokens, instructions: a.instructions, welcomeMessage: a.welcomeMessage ?? "", fallbackMessage: a.fallbackMessage ?? "",
  memoryTurns: a.memoryTurns, tools: a.tools,
});

export type WizardAgent = AiAgentDto & { knowledge: KnowledgeDto[] };

const IMPORT_EXAMPLE = JSON.stringify({
  name: "Acme Support", description: "Answers questions about Acme orders.", category: "Customer Support", language: "English",
  instructions: "Answer politely and briefly. Never invent order details.", welcomeMessage: "Hi! How can I help?", fallbackMessage: "Sorry, please contact support.",
  temperature: 0.3, maxTokens: 1024, memoryTurns: 10,
}, null, 2);

export function AiAgentWizard({ demo, models, imageModels = [], preselectModel, initial, templateId = null, initialStep = 0 }: { demo: boolean; models: ModelDto[]; imageModels?: ModelDto[]; preselectModel: string | null; initial: WizardAgent | null; templateId?: string | null; initialStep?: number }) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const [agent, setAgent] = React.useState<AiAgentDto | null>(initial);
  const [knowledge, setKnowledge] = React.useState<KnowledgeDto[]>(initial?.knowledge ?? []);
  const startTemplate = React.useMemo(() => (initial ? undefined : AGENT_TEMPLATES.find((t) => t.id === templateId)), [initial, templateId]);
  const [form, setForm] = React.useState<AgentForm>(() =>
    initial ? fromAgent(initial) : {
      name: startTemplate?.name ?? "", username: startTemplate ? suggestUsername(startTemplate.name) : "", description: startTemplate?.description ?? "", language: startTemplate?.language ?? "English",
      category: startTemplate?.category ?? "Community Manager", modelSlug: preselectModel ?? usable(startTemplate?.modelSlug, models), imageModelSlug: usable(startTemplate?.imageModelSlug, imageModels), commands: startTemplate?.commands ?? [], temperature: startTemplate?.temperature ?? 0.5, maxTokens: startTemplate?.maxTokens ?? 1024,
      instructions: startTemplate?.instructions ?? "", welcomeMessage: startTemplate?.welcomeMessage ?? "", fallbackMessage: startTemplate?.fallbackMessage ?? "",
      memoryTurns: startTemplate?.memoryTurns ?? 10, tools: { ...DEFAULT_TOOLS, ...startTemplate?.tools },
    });
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [filled, setFilled] = React.useState<string | undefined>(startTemplate ? `Filled from the "${startTemplate.name}" template. Review and edit anything.` : undefined);
  const [usernameTouched, setUsernameTouched] = React.useState(Boolean(initial));
  const [pending, setPending] = React.useState<PendingImage>(NO_PENDING);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [activating, setActivating] = React.useState(false);
  const [justActivated, setJustActivated] = React.useState(false);
  const [editedInSession, setEditedInSession] = React.useState(false);
  const [formError, setFormError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const isEditing = Boolean(initial);

  const isDirty = React.useMemo(() => {
    if (!agent) return true;
    if (pending.kind !== "none") return true;
    const base = fromAgent(agent);
    return (
      form.name !== base.name ||
      form.username !== base.username ||
      form.description !== base.description ||
      form.language !== base.language ||
      form.category !== base.category ||
      form.modelSlug !== base.modelSlug ||
      form.imageModelSlug !== base.imageModelSlug ||
      form.temperature !== base.temperature ||
      form.maxTokens !== base.maxTokens ||
      form.instructions !== base.instructions ||
      form.welcomeMessage !== base.welcomeMessage ||
      form.fallbackMessage !== base.fallbackMessage ||
      form.memoryTurns !== base.memoryTurns ||
      JSON.stringify(form.tools) !== JSON.stringify(base.tools) ||
      JSON.stringify(form.commands) !== JSON.stringify(base.commands)
    );
  }, [agent, form, pending.kind]);

  const patch = React.useCallback((p: Partial<AgentForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => {
      const keys = Object.keys(p) as (keyof AgentForm)[];
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }, []);

  /** Fills the form from a template or an imported file. Fields the source leaves out keep their current value. */
  function applyPreset(p: Partial<AgentPreset>, label: string) {
    const { username, tools, modelSlug, imageModelSlug, commands, ...rest } = p;
    // A template names catalog models; use them only when this workspace can run them.
    const chosenModel = usable(modelSlug, models);
    const chosenImage = usable(imageModelSlug, imageModels);
    patch({
      ...rest, ...(tools && { tools: { ...form.tools, ...tools } }),
      ...(chosenModel && { modelSlug: chosenModel }), ...(chosenImage && { imageModelSlug: chosenImage }), ...(commands && { commands }),
    });
    if (!agent) {
      if (username) { setUsernameTouched(true); patch({ username }); }
      else if (rest.name && !usernameTouched) patch({ username: suggestUsername(rest.name) });
    }
    setFilled(`Filled from ${label}. Review and edit anything.`);
    setNotice(undefined);
  }
  const model = models.find((m) => m.slug === form.modelSlug);

  const savedAvatar = publicStorageUrl(BUCKETS.avatars, agent?.avatarPath);
  const stagedUrl = React.useMemo(() => (pending.kind === "set" ? URL.createObjectURL(pending.blob) : null), [pending]);
  React.useEffect(() => () => { if (stagedUrl) URL.revokeObjectURL(stagedUrl); }, [stagedUrl]);
  const avatarUrl = pending.kind === "remove" ? null : stagedUrl ?? savedAvatar;

  function validateStep(s: number): FieldErrors {
    const e: FieldErrors = {};
    if (s === 1) {
      if (!form.name.trim()) e.name = "Enter a name for your agent.";
      if (!USERNAME_RE.test(form.username.trim())) e.username = "Use 5-32 letters, digits or underscores, ending in \"bot\".";
      if (!form.description.trim()) e.description = "Describe what your agent does.";
    }
    if (s === 0 && !agent?.botId) e.telegram = "Connect your Telegram bot to continue. Paste the token from BotFather.";
    if (s === 2) {
      if (!form.modelSlug || !models.some((m) => m.slug === form.modelSlug)) e.modelSlug = "Choose a model to continue.";
      if (!Number.isInteger(form.maxTokens) || form.maxTokens < 64 || form.maxTokens > 4096) e.maxTokens = "Pick a reply length between 64 and 4,096 tokens.";
    }
    if (s === 3) {
      const n = form.instructions.trim().length;
      if (n === 0) e.instructions = "Write instructions so the agent knows how to behave.";
      else if (n < INSTRUCTIONS_MIN) e.instructions = `Add a little more detail (${INSTRUCTIONS_MIN - n} more characters).`;
    }
    if (s === 4) {
      const problem = validateCommands(form.commands);
      if (problem) e.commands = problem;
    }
    return e;
  }

  /** First step before `target` that still has errors, or -1. */
  function firstBlockedBefore(target: number) {
    for (let s = 0; s < target; s++) if (Object.keys(validateStep(s)).length) return s;
    return -1;
  }

  function showErrors(found: FieldErrors) {
    setErrors(found);
    setNotice(undefined);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[aria-invalid=\"true\"]");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  }

  function goTo(target: number) {
    if (target <= step) { setStep(target); setNotice(undefined); return; }
    const blocked = firstBlockedBefore(target);
    if (blocked === -1) { setStep(target); setNotice(undefined); return; }
    setStep(blocked);
    showErrors(validateStep(blocked));
  }

  /** Saves the whole form: creates the agent the first time, then patches it. Returns the saved agent or null on failure. */
  async function persist(
    redirectStep = step,
    opts?: { silent?: boolean; notifySummary?: boolean },
  ): Promise<AiAgentDto | null> {
    setFormError(undefined);
    if (demo) { setFormError("Demo mode: connect Supabase to save AI agents."); return null; }
    const found = validateStep(1);
    if (Object.keys(found).length) { setStep(1); showErrors(found); return null; }
    const hadLocalChanges = isDirty;
    setSaving(true);
    let avatarPath: string | null | undefined; // undefined = unchanged
    const sb = await createClient();
    if (pending.kind === "set") {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setSaving(false); setFormError("Your session expired. Sign in again."); return null; }
      avatarPath = `${session.user.id}/agent-${Date.now()}.${pending.blob.type === "image/webp" ? "webp" : "png"}`;
      const up = await sb.storage.from(BUCKETS.avatars).upload(avatarPath, pending.blob, { contentType: pending.blob.type, cacheControl: "31536000" });
      if (up.error) { setSaving(false); setFormError("Could not upload the avatar. Check the file and try again."); return null; }
    } else if (pending.kind === "remove") avatarPath = null;

    const basics = { name: form.name, username: form.username.trim(), description: form.description, language: form.language, category: form.category };
    const r = agent
      ? await api<AiAgentDto>(`/api/v1/ai-agents/${agent.id}`, {
          method: "PATCH",
          body: {
            ...basics, ...(agentUsernameLocked(agent) ? { username: undefined } : {}), ...(avatarPath !== undefined && { avatarPath }),
            modelSlug: form.modelSlug, imageModelSlug: form.imageModelSlug, commands: form.commands, temperature: form.temperature, maxTokens: form.maxTokens, instructions: form.instructions,
            welcomeMessage: form.welcomeMessage || null, fallbackMessage: form.fallbackMessage || null, memoryTurns: form.memoryTurns, tools: form.tools,
            ...(opts?.silent ? { silent: true } : {}),
            ...(opts?.notifySummary ? { notifySummary: true } : {}),
          },
        })
      : await api<AiAgentDto>("/api/v1/ai-agents", { body: { ...basics, avatarPath: avatarPath ?? null, modelSlug: form.modelSlug } });
    setSaving(false);
    if (!r.ok) {
      if (avatarPath) await sb.storage.from(BUCKETS.avatars).remove([avatarPath]);
      const fe: FieldErrors = {};
      for (const d of r.details) if (d.path && d.message && ["name", "username", "description"].includes(d.path)) fe[d.path as "name"] = d.message;
      if (r.status === 409) fe.username = r.message;
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError(r.message);
      else setStep(1);
      return null;
    }
    // Remove the previous picture once the new one is saved.
    if (avatarPath !== undefined && agent?.avatarPath && agent.avatarPath !== avatarPath) void sb.storage.from(BUCKETS.avatars).remove([agent.avatarPath]);
    setAgent(r.data);
    setPending(NO_PENDING);
    if (opts?.silent && hadLocalChanges) setEditedInSession(true);
    if (!opts?.silent) setEditedInSession(false);
    if (!agent) router.replace(`/ai/agents/${r.data.id}?step=${redirectStep}`, { scroll: false });
    return r.data;
  }

  async function next() {
    const found = validateStep(step);
    if (Object.keys(found).length) return showErrors(found);
    if (step === 0) { setStep(1); setNotice(undefined); return; }
    const nextStep = step < STEPS.length - 1 ? step + 1 : step;
    // Skip redundant network saves when stepping through an already-saved agent with no edits, and keep step saves quiet.
    if (agent && !isDirty) {
      if (step < STEPS.length - 1) { setStep(nextStep); setNotice(undefined); }
      return;
    }
    const saved = await persist(nextStep, { silent: true });
    if (saved && step < STEPS.length - 1) { setStep(nextStep); setNotice(undefined); }
  }

  async function saveDraft() {
    if (!agent) { showErrors({ telegram: "Connect your Telegram bot first. Your agent is created from it." }); return; }
    const saved = await persist(step, { silent: true });
    if (saved) setNotice("Draft saved. You can come back to this agent from AI Agents.");
  }

  async function saveChanges() {
    if (!agent) { showErrors({ telegram: "Connect your Telegram bot first. Your agent is created from it." }); return; }
    const found = validateStep(step);
    if (Object.keys(found).length) return showErrors(found);
    if (!isDirty && !editedInSession) {
      toast.info("No changes to save");
      return;
    }
    const saved = await persist(step, { silent: false, notifySummary: editedInSession });
    if (saved) {
      toast.success("AI Agent changes saved");
      setNotice("All changes saved and synced.");
      router.refresh();
    }
  }

  async function activate() {
    if (!agent) return;
    setActivating(true); setFormError(undefined);
    const saved = await persist(step, { silent: true });
    if (!saved) { setActivating(false); return; }
    const r = await api<AiAgentDto>(`/api/v1/ai-agents/${agent.id}/activate`, { method: "POST", body: {} });
    setActivating(false);
    if (!r.ok) return setFormError(r.message);
    setAgent(r.data);
    setEditedInSession(false);
    setJustActivated(true);
    router.refresh();
  }

  const onAsk = React.useMemo(() => {
    if (!agent || !form.modelSlug || demo) return undefined;
    return async (history: { role: "user" | "assistant"; content: string }[], message: string) => {
      const r = await api<{ reply: string; imageBase64?: string; sources?: CitationSource[]; webMedia?: WebMediaPayload; agentic?: AgenticPayload; ms?: number }>(`/api/v1/ai-agents/${agent.id}/test`, { body: { message, history } });
      return r.ok
        ? { ok: true as const, reply: r.data.reply, imageBase64: r.data.imageBase64, sources: r.data.sources, webMedia: r.data.webMedia, agentic: r.data.agentic, ms: r.data.ms }
        : { ok: false as const, message: r.message };
    };
  }, [agent, form.modelSlug, demo]);

  if (justActivated && agent?.status === "active" && step === STEPS.length - 1) {
    return (
      <Card glow className="mx-auto max-w-md p-8 text-center">
        <span className="pop-in rn-icon-float mx-auto grid size-20 place-items-center rounded-full border-4 border-success/80 text-ok shadow-[0_0_40px_-6px_rgb(var(--rn-success))]" aria-hidden><Check className="size-10" strokeWidth={3} /></span>
        <h2 className="mt-5 text-2xl font-extrabold">Your agent is live <span aria-hidden className="emoji-party">&#127881;</span></h2>
        <p className="mt-1 text-sm text-foreground/80"><span className="font-semibold">{agent.name}</span> now answers messages sent to @{agent.username} on Telegram.</p>
        <a href={`https://t.me/${agent.username}`} target="_blank" rel="noopener noreferrer" className="btn-primary-bg sheen mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white">Open in Telegram <ArrowRight className="size-4" aria-hidden /></a>
        <ButtonLink href="/ai" variant="outline" className="mt-3 w-full">Go to AI Agents</ButtonLink>
      </Card>
    );
  }

  const baseMeta = STEPS[step]!;
  const meta =
    step === STEPS.length - 1 && isEditing && agent?.status === "active"
      ? { label: "Review & Save", title: "Review & Save Changes", sub: "Review your settings, test in the live preview, and save updates." }
      : baseMeta;
  const shownName = form.name.trim() || "Your AI Agent";
  const shownUser = (agent?.botId ? agent.username : form.username.trim()) || "your_agent_bot";
  const shownDesc = form.description.trim() || "Describe what your AI agent does. This text appears on its Telegram profile.";
  const reachable = (i: number) => i <= step || Boolean(agent);
  const errorCount = Object.keys(errors).length;
  const hasAnyChanges = isDirty || editedInSession;

  return (
    <div className="space-y-6">
      <ol aria-label="Steps" className="card grid grid-cols-3 gap-x-2 gap-y-3 p-4 sm:grid-cols-6 sm:p-5">
        {STEPS.map((s, i) => {
          const stepLabel = i === STEPS.length - 1 && isEditing && agent?.status === "active" ? "Review & Save" : s.label;
          return (
          <li key={s.label} aria-current={i === step ? "step" : undefined} className="relative flex flex-col items-center gap-1.5 text-center">
            {i < STEPS.length - 1 && (
              <ChevronRight className="pointer-events-none absolute -right-2 top-2 hidden size-4 text-muted/60 sm:block" aria-hidden />
            )}
            <button type="button" disabled={!reachable(i)} onClick={() => goTo(i)} aria-label={`Step ${i + 1}: ${stepLabel}`}
              className={cn("grid size-8 place-items-center rounded-full border text-sm font-bold transition", i === step ? "btn-primary-bg border-transparent text-white shadow-[0_0_18px_-2px_rgb(var(--rn-primary))]" : i < step ? "border-success/60 bg-success/15 text-ok" : "border-border text-muted", !reachable(i) && "cursor-not-allowed opacity-60")}>
              {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
            </button>
            <span className={cn("text-xs font-semibold sm:text-sm", i === step ? "text-lavender" : "text-muted")}>{stepLabel}</span>
          </li>
          );
        })}
      </ol>

      <div className={cn("grid items-start gap-4", step !== 0 && "xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]")}>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <IconTile tone="primary" size="lg"><BrainCircuit /></IconTile>
            <div><h2 className="text-xl font-extrabold leading-tight">{meta.title}</h2><p className="text-sm text-muted">{meta.sub}</p></div>
          </div>

          {step === 1 && !initial && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="flex min-w-0 items-center gap-2 text-sm text-foreground/85"><Sparkles className="size-4 shrink-0 text-lavender" aria-hidden />{filled ?? "Save time: start from a template or import a file to auto-fill the details."}</p>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>Templates &amp; import</Button>
            </div>
          )}

          <div className={cn(step === 1 && "grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]")}>
            <div>
              {step === 1 && (
                <StepBasics form={form} patch={patch} errors={errors} avatarUrl={savedAvatar} pending={pending} onPending={setPending} saving={saving} disabledUpload={demo} usernameLocked={Boolean(agent?.botId)}
                  onName={(v) => { patch({ name: v }); if (!usernameTouched) patch({ username: suggestUsername(v) }); }}
                  onUsername={(v) => { setUsernameTouched(true); patch({ username: v }); }} />
              )}
              {step === 0 && <StepTelegram agent={agent} demo={demo} onConnected={(a) => { setAgent(a); setErrors((e) => ({ ...e, telegram: undefined })); if (!initial) router.replace(`/ai/agents/${a.id}?step=1`, { scroll: false }); else setStep(1); }} blockedMessage={errors.telegram} />}
              {step === 2 && <StepModel form={form} patch={patch} models={models} imageModels={imageModels} error={errors.modelSlug} errors={errors} />}
              {step === 3 && <StepKnowledge form={form} patch={patch} errors={errors} agentId={agent?.id ?? null} botId={agent?.botId ?? null} demo={demo} knowledge={knowledge} onKnowledge={setKnowledge} />}
              {step === 4 && (
                <StepTools
                  form={form}
                  patch={patch}
                  imageModels={imageModels}
                  agentId={agent?.id ?? null}
                  botConnected={Boolean(agent?.botId)}
                  demo={demo}
                  defaultBriefing={startTemplate?.dailyBriefing}
                />
              )}
              {step === 5 && (
                <StepReview
                  form={form}
                  agent={agent}
                  model={model}
                  knowledgeCount={knowledge.length}
                  onActivate={activate}
                  activating={activating}
                  onSaveChanges={isEditing ? saveChanges : undefined}
                  saving={saving}
                  hasChanges={hasAnyChanges}
                  error={formError}
                />
              )}
            </div>

            {step === 1 && (
              <aside aria-label="Agent preview" className="rounded-2xl border border-border bg-surface-2/60 p-4 lg:self-start">
                <div className="mb-3 flex items-center gap-2.5">
                  <Eye className="size-6 text-lavender" aria-hidden />
                  <div><h3 className="font-bold leading-tight">Agent Preview</h3><p className="text-xs text-muted">This is how your AI agent will appear on Telegram.</p></div>
                </div>
                <div className="rounded-2xl border border-primary/40 bg-gradient-to-b from-primary/15 to-transparent p-4 text-center">
                  <span className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full bg-primary/25 text-lavender ring-2 ring-primary/50">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <Bot className="size-12" aria-hidden />}
                  </span>
                  <p className="mt-3 break-words text-xl font-extrabold leading-tight">{shownName}</p>
                  <p className="break-all text-sm text-muted">@{shownUser}</p>
                  <p className="mt-3 line-clamp-5 break-words text-sm text-foreground/80">{shownDesc}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Badge tone="primary" className="rounded-full py-1"><Users className="size-3" aria-hidden />{form.category}</Badge>
                    <Badge tone="primary" className="rounded-full py-1"><Globe className="size-3" aria-hidden />{form.language}</Badge>
                    {model && <Badge tone="primary" className="rounded-full py-1"><Layers className="size-3" aria-hidden />{model.name}</Badge>}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </Card>

        {step !== 0 && (
          <TelegramPreview key={`${agent?.id ?? "new"}:${form.modelSlug ?? ""}`} name={form.name.trim()} avatar={avatarUrl} onAsk={onAsk}
            note={onAsk ? "Replies come from the saved agent. Save changes to test them." : "Choose a model and save the agent to chat with it live."} />
        )}
      </div>

      {errorCount > 0 && <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-bad"><AlertCircle className="size-4 shrink-0" aria-hidden />{errorCount === 1 ? "1 field needs your attention. It is highlighted in red above." : `${errorCount} fields need your attention. They are highlighted in red above.`}</p>}
      {formError && step !== 5 && <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-bad"><XCircle className="size-4 shrink-0" aria-hidden />{formError}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-ok">{notice}</p>}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/ai" variant="outline"><X className="size-4" aria-hidden />{isEditing ? "Back" : "Cancel"}</ButtonLink>
          {isEditing ? (
            <Button variant={step === STEPS.length - 1 ? "primary" : "subtle"} onClick={saveChanges} disabled={saving || !hasAnyChanges}>
              <Save className="size-4" aria-hidden />{saving ? "Saving..." : "Save Changes"}
            </Button>
          ) : (
            <Button variant="outline" onClick={saveDraft} disabled={saving}><FolderOpen className="size-4" aria-hidden />{saving ? "Saving..." : "Save as Draft"}</Button>
          )}
          {isEditing && hasAnyChanges && <span className="text-xs font-medium text-warn">Unsaved changes</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setStep(step - 1); setNotice(undefined); setErrors({}); }} disabled={step === 0}><ArrowLeft className="size-4" aria-hidden />Previous</Button>
          {step < STEPS.length - 1 && <Button onClick={next} disabled={saving}>{saving ? "Saving..." : "Continue"} <ArrowRight className="size-4" aria-hidden /></Button>}
        </div>
      </Card>
      <ImportPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title="Auto-fill your agent" fields="name, username, description, category, language, instructions, welcomeMessage, fallbackMessage, temperature, maxTokens, memoryTurns, tools, modelSlug, imageModelSlug, commands"
        templates={AGENT_TEMPLATES} example={IMPORT_EXAMPLE}
        onPickTemplate={(id) => { const t = AGENT_TEMPLATES.find((x) => x.id === id); if (t) applyPreset(t, `the "${t.name}" template`); }}
        parse={parseAgentImport} onImport={(p) => applyPreset(p, "your imported file")} />
      <p className="text-center text-xs text-muted">Need a standard bot instead? <Link href="/bots/new" className="font-semibold text-lavender hover:underline">Create a Standard Telegram Bot</Link></p>
    </div>
  );
}

/** The slug when it is in the list of models this workspace can use, otherwise null. */
function usable(slug: string | undefined, list: ModelDto[]): string | null {
  return slug && list.some((m) => m.slug === slug) ? slug : null;
}

/** Once a Telegram bot is linked, its real username is authoritative and cannot be edited here. */
function agentUsernameLocked(a: AiAgentDto) {
  return Boolean(a.botId);
}
