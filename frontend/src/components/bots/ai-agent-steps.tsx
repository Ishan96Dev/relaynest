"use client";
import { AlertCircle, Bot, Check, CheckCircle2, ExternalLink, LayoutTemplate, Plus, Save, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { AgentTools } from "@backend/server/ai/agent";
import { RESERVED_COMMANDS, type AgentCommand } from "@backend/lib/validation/schemas";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import type { AiAgentDto, KnowledgeDto } from "@backend/server/services/ai-agents";
import { KnowledgeTemplateModal } from "@/components/ai/knowledge-template-picker";
import { PromptTemplateModal } from "@/components/ai/prompt-template-picker";
import { ProviderMark } from "@/components/ai/provider-mark";
import {
  ResponseTemplateModal,
  ResponseTemplateQuickBar,
  type ResponseTemplatePatch,
} from "@/components/bots/response-template-picker";
import { TelegramConnectCard } from "@/components/bots/telegram-connect-card";
import { TelegramUsernameChecker } from "@/components/bots/telegram-username-check";
import { AgentBriefingPanel } from "@/components/bots/agent-briefing-panel";
import { BotKnowledge } from "@/components/knowledge/bot-knowledge";
import type { AgentDailyBriefingPreset } from "@/lib/agent-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileUpload, type PendingImage } from "@/components/ui/file-upload";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { formatTokens } from "@/lib/model-format";
import { getQuickKnowledgeTemplates, KNOWLEDGE_SOURCE_TEMPLATES, type KnowledgeSourceTemplate } from "@/lib/knowledge-templates";
import { TELEGRAM_AGENT_PROMPT_TEMPLATES, type SystemPromptTemplate } from "@/lib/prompt-templates";
import { AI_AGENT_RESPONSE_TEMPLATES } from "@/lib/response-templates";
import { cn } from "@/lib/utils";

export interface AgentForm {
  name: string;
  username: string;
  description: string;
  language: string;
  category: string;
  modelSlug: string | null;
  imageModelSlug: string | null;
  commands: AgentCommand[];
  temperature: number;
  maxTokens: number;
  instructions: string;
  welcomeMessage: string;
  fallbackMessage: string;
  memoryTurns: number;
  tools: AgentTools;
}

export type Patch = (p: Partial<AgentForm>) => void;

export const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Hindi", "Arabic", "Japanese", "Chinese", "Russian"];
export const CATEGORIES = [
  "Finance & Markets",
  "Real Estate & Land",
  "Education",
  "Sports",
  "Gaming",
  "Business & Ops",
  "Legal & Tax",
  "Shopping & Deals",
  "Lifestyle & Travel",
  "Community Manager",
  "Customer Support",
  "Sales Assistant",
  "FAQ Assistant",
  "Productivity",
  "Entertainment",
  "Other",
];
export const DESC_MAX = 300;
export const INSTRUCTIONS_MIN = 20;
export type FieldErrors = Partial<Record<keyof AgentForm | "telegram", string>>;
export const TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{30,50}$/;
const TOKEN_OPTIONS = [256, 512, 1024, 2048, 4096];

export function StepBasics({ form, patch, errors, onName, onUsername, avatarUrl, pending, onPending, saving, disabledUpload, usernameLocked = false }: {
  form: AgentForm; patch: Patch; errors: FieldErrors; onName: (v: string) => void; onUsername: (v: string) => void;
  avatarUrl: string | null; pending: PendingImage; onPending: (p: PendingImage) => void; saving: boolean; disabledUpload: boolean; usernameLocked?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="Agent Name" htmlFor="agent-name" required error={errors.name} hint="Shown to people in Telegram. Up to 50 characters.">
          <Input id="agent-name" value={form.name} maxLength={50} placeholder="RelayNest Assistant" onChange={(e) => onName(e.target.value)} />
        </Field>
        <Field label="Agent Username" htmlFor="agent-username" required error={errors.username} hint={usernameLocked ? "Imported from Telegram. Change it in @BotFather if needed." : "Must end in bot. Check @BotFather availability below."}>
          {usernameLocked
            ? <Input id="agent-username" readOnly icon={<span className="text-sm font-semibold">@</span>} value={form.username} />
            : <TelegramUsernameChecker seedName={form.name} value={form.username} onChange={(v) => onUsername(v)} onPickSuggestion={(s) => onUsername(s)} />}
        </Field>
      </div>
      <Field label="Agent Description" htmlFor="agent-description" required counter={`${form.description.length} / ${DESC_MAX}`} error={errors.description} hint="One or two sentences. It appears on the Telegram profile.">
        <Textarea id="agent-description" rows={4} value={form.description} maxLength={DESC_MAX} placeholder="An intelligent AI assistant that answers questions, provides updates and helps with automation."
          onChange={(e) => patch({ description: e.target.value })} />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-semibold">Agent Avatar <span className="font-normal text-muted">(optional)</span></p>
        <FileUpload value={avatarUrl} pending={pending} onPendingChange={onPending} saving={saving} shape="square" size={512} title="Upload Image"
          hint="PNG, JPG or WebP. Max 2 MB." fallback={<Bot className="size-8" />} disabled={disabledUpload} disabledReason="Demo mode: connect Supabase to upload an avatar." />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="Primary Language" htmlFor="agent-language" required>
          <Select id="agent-language" value={form.language} onChange={(e) => patch({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}</Select>
        </Field>
        <Field label="Agent Category" htmlFor="agent-category" required>
          <Select id="agent-category" value={form.category} onChange={(e) => patch({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
      </div>
    </div>
  );
}

export function StepModel({ form, patch, models, imageModels, error, errors }: { form: AgentForm; patch: Patch; models: ModelDto[]; imageModels: ModelDto[]; error?: string; errors: FieldErrors }) {
  const selected = models.find((m) => m.slug === form.modelSlug);
  const tokenOptions = TOKEN_OPTIONS.includes(form.maxTokens) ? TOKEN_OPTIONS : [...TOKEN_OPTIONS, form.maxTokens].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      <div>
        <p id="agent-model-label" className="mb-1.5 text-sm font-semibold">AI model <span className="text-bad">*</span></p>
        <div role="radiogroup" aria-labelledby="agent-model-label" aria-invalid={Boolean(error)}
          className={cn("grid max-h-[360px] gap-2.5 overflow-y-auto rounded-xl p-1.5 sm:grid-cols-2", error ? "ring-2 ring-danger/40" : "ring-1 ring-border/60")}>
          {models.map((m) => {
            const on = m.slug === form.modelSlug;
            return (
              <button key={m.slug} type="button" role="radio" aria-checked={on}
                onClick={() => patch(on ? { modelSlug: m.slug } : { modelSlug: m.slug, temperature: Math.min(1, m.defaultTemperature), maxTokens: Math.min(4096, Math.max(64, m.defaultMaxTokens)) })}
                className={cn("flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition", on ? "border-lavender bg-primary/15 shadow-[0_0_24px_-10px_rgb(var(--rn-primary))]" : "border-border bg-surface-2/60 hover:border-lavender/50")}>
                <ProviderMark providerKey={m.providerKey} name={m.providerName} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{m.providerName} &bull; {formatTokens(m.contextTokens)} context{m.isFree ? " \u2022 Free" : ""}</span>
                </span>
                {on && <Check className="size-5 shrink-0 text-lavender" aria-hidden />}
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-bad"><AlertCircle className="size-3.5 shrink-0" aria-hidden />{error}</p>}
      </div>
      <p className="text-xs text-muted">Only chat and multimodal language models can power an agent. <Link href="/ai/models" className="font-semibold text-lavender hover:underline">Browse the full catalog</Link></p>
      {imageModels.length > 0 && (
        <Field label="Image model (optional)" htmlFor="agent-image-model" hint="Used by /imagine and image commands. Defaults to FLUX.1 Schnell automatically if left on Auto.">
          <Select id="agent-image-model" value={form.imageModelSlug ?? ""} onChange={(e) => patch({ imageModelSlug: e.target.value || null })}>
            <option value="">Auto (FLUX.1 Schnell)</option>
            {imageModels.map((m) => <option key={m.slug} value={m.slug}>{m.name} ({m.providerName})</option>)}
          </Select>
        </Field>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label={`Creativity (temperature): ${form.temperature.toFixed(2)}`} htmlFor="agent-temp" hint="Lower is more factual. Higher is more varied.">
          <div className="flex h-10 items-center">
            <input id="agent-temp" type="range" min={0} max={1} step={0.05} value={form.temperature} onChange={(e) => patch({ temperature: Number(e.target.value) })} className="w-full accent-[rgb(var(--rn-primary))]" />
          </div>
        </Field>
        <Field label="Max reply length (tokens)" htmlFor="agent-max" required error={errors.maxTokens} hint="Reasoning models need 2,048 or more to finish thinking and answer.">
          <Select id="agent-max" value={String(form.maxTokens)} onChange={(e) => patch({ maxTokens: Number(e.target.value) })}>
            {tokenOptions.map((v) => <option key={v} value={String(v)}>{v.toLocaleString("en-US")} tokens</option>)}
          </Select>
        </Field>
      </div>
      {selected && <p className="rounded-lg border border-border bg-surface-2/60 p-3 text-xs text-muted">{selected.description}</p>}
    </div>
  );
}

export function StepKnowledge({ form, patch, errors, agentId, botId = null, demo = false, knowledge, onKnowledge }: {
  form: AgentForm; patch: Patch; errors: FieldErrors; agentId: string | null; botId?: string | null; demo?: boolean; knowledge: KnowledgeDto[]; onKnowledge: (k: KnowledgeDto[]) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [srcErrors, setSrcErrors] = React.useState<{ title?: string; content?: string }>({});
  const [tplOpen, setTplOpen] = React.useState(false);
  const [respTplOpen, setRespTplOpen] = React.useState(false);
  const [knowledgeTplOpen, setKnowledgeTplOpen] = React.useState(false);
  const [loadedKnowledgeTpl, setLoadedKnowledgeTpl] = React.useState<string | null>(null);
  const sourceTitleRef = React.useRef<HTMLInputElement>(null);
  const used = knowledge.reduce((n, k) => n + k.content.length, 0);

  // Surface templates matching the agent's selected category first, then top general Telegram personas.
  const quickTemplates = React.useMemo(() => {
    const matched = TELEGRAM_AGENT_PROMPT_TEMPLATES.filter((t) => t.category === form.category);
    const others = TELEGRAM_AGENT_PROMPT_TEMPLATES.filter((t) => t.category !== form.category);
    return [...matched, ...others].slice(0, 4);
  }, [form.category]);

  const quickKnowledgeTemplates = React.useMemo(
    () => getQuickKnowledgeTemplates(form.category, 4),
    [form.category],
  );
  const existingKnowledgeTitles = React.useMemo(
    () => new Set(knowledge.map((k) => k.title.trim().toLowerCase())),
    [knowledge],
  );

  function applyTemplate(tpl: SystemPromptTemplate) {
    patch({
      instructions: tpl.prompt,
      ...(tpl.recommendedTemperature !== undefined ? { temperature: tpl.recommendedTemperature } : {}),
    });
  }

  function applyResponseTemplate(p: ResponseTemplatePatch) {
    patch({
      ...(p.welcomeMessage !== undefined ? { welcomeMessage: p.welcomeMessage } : {}),
      ...(p.fallbackMessage !== undefined ? { fallbackMessage: p.fallbackMessage } : {}),
    });
  }

  function applyKnowledgeTemplate(tpl: KnowledgeSourceTemplate) {
    setTitle(tpl.title);
    setContent(tpl.content);
    setSrcErrors({});
    setError(undefined);
    setLoadedKnowledgeTpl(tpl.name);
    requestAnimationFrame(() => sourceTitleRef.current?.focus({ preventScroll: false }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || busy) return;
    const found = { title: title.trim() ? undefined : "Enter a title for this source.", content: content.trim() ? undefined : "Paste the text the agent should use." };
    setSrcErrors(found);
    if (found.title || found.content) return;
    setBusy(true); setError(undefined);
    const r = await api<KnowledgeDto>(`/api/v1/ai-agents/${agentId}/knowledge`, { body: { title, content } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onKnowledge([...knowledge, r.data]); setTitle(""); setContent(""); setLoadedKnowledgeTpl(null);
  }
  async function remove(id: string) {
    if (!agentId) return;
    const r = await api<void>(`/api/v1/ai-agents/${agentId}/knowledge/${id}`, { method: "DELETE" });
    if (r.ok) onKnowledge(knowledge.filter((k) => k.id !== id)); else setError(r.message);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted">System prompt &amp; role instructions</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setTplOpen(true)}>
            <LayoutTemplate className="size-3.5 text-lavender" aria-hidden />
            Browse {TELEGRAM_AGENT_PROMPT_TEMPLATES.length} Telegram prompt templates
          </Button>
        </div>
        <Field label="Instructions" htmlFor="agent-instructions" required error={errors.instructions} counter={`${form.instructions.length} / 8000`}
          hint={`Tell the agent who it is, what it should do and what it must avoid. At least ${INSTRUCTIONS_MIN} characters.`}>
          <Textarea id="agent-instructions" rows={7} maxLength={8000} value={form.instructions} onChange={(e) => patch({ instructions: e.target.value })} placeholder="You help customers of Acme with orders and shipping..." />
        </Field>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Telegram system prompt templates">
          {quickTemplates.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant={form.instructions.trim() === t.prompt.trim() ? "subtle" : "outline"}
              size="sm"
              title={t.tagline}
              onClick={() => applyTemplate(t)}
            >
              Use: {t.name}
            </Button>
          ))}
        </div>
      </div>
      <PromptTemplateModal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        scope="telegram"
        activePrompt={form.instructions}
        preferredCategory={form.category}
        onApply={applyTemplate}
      />
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted">Automatic welcome &amp; fallback messages</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRespTplOpen(true)}>
            <LayoutTemplate className="size-3.5 text-lavender" aria-hidden />
            Browse {AI_AGENT_RESPONSE_TEMPLATES.length} response templates
          </Button>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Welcome message" htmlFor="agent-welcome" counter={`${form.welcomeMessage.length} / 4096`} hint="Optional. Sent when someone starts the bot with /start.">
            <Textarea id="agent-welcome" rows={4} maxLength={4096} value={form.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value })} placeholder="Hi! I'm here to help. Ask me anything." />
          </Field>
          <Field label="Fallback message" htmlFor="agent-fallback" counter={`${form.fallbackMessage.length} / 4096`} hint="Optional. Sent when the model cannot answer, for example during an outage.">
            <Textarea id="agent-fallback" rows={4} maxLength={4096} value={form.fallbackMessage} onChange={(e) => patch({ fallbackMessage: e.target.value })} placeholder="Sorry, I couldn't answer that right now." />
          </Field>
        </div>
        <ResponseTemplateQuickBar
          scope="ai-agent"
          botName={form.name}
          activeWelcome={form.welcomeMessage}
          activeFallback={form.fallbackMessage}
          preferredCategory={form.category}
          onApply={applyResponseTemplate}
          onOpenModal={() => setRespTplOpen(true)}
        />
      </div>
      <ResponseTemplateModal
        open={respTplOpen}
        onClose={() => setRespTplOpen(false)}
        scope="ai-agent"
        botName={form.name}
        activeWelcome={form.welcomeMessage}
        activeFallback={form.fallbackMessage}
        preferredCategory={form.category}
        onApply={applyResponseTemplate}
      />

      <section aria-labelledby="knowledge-title" className="rounded-2xl border border-border bg-surface-2/50 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="knowledge-title" className="text-base font-bold">Knowledge sources <span className="text-xs font-normal text-muted">(optional)</span></h3>
            <p className="text-xs text-muted">{used.toLocaleString("en-US")} characters (the first 24,000 are used)</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setKnowledgeTplOpen(true)}>
            <LayoutTemplate className="size-3.5 text-lavender" aria-hidden />
            Browse {KNOWLEDGE_SOURCE_TEMPLATES.length} knowledge templates
          </Button>
        </div>
        {!agentId ? (
          <p className="text-sm text-muted">Save your agent first (Continue on step 1) to add knowledge.</p>
        ) : (
          <>
            {knowledge.length > 0 && (
              <ul className="mb-3 space-y-2">
                {knowledge.map((k) => (
                  <li key={k.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface/70 p-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{k.title}</p><p className="line-clamp-2 text-xs text-muted">{k.content}</p></div>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${k.title}`} onClick={() => remove(k.id)}><Trash2 className="size-4" aria-hidden /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mb-3 space-y-1.5">
              <p className="text-xs font-medium text-muted">Quick-start templates</p>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Knowledge source templates">
                {quickKnowledgeTemplates.map((t) => {
                  const isLoaded = title.trim() === t.title.trim() && content.trim() === t.content.trim();
                  const alreadyAdded = existingKnowledgeTitles.has(t.title.trim().toLowerCase());
                  return (
                    <Button
                      key={t.id}
                      type="button"
                      variant={isLoaded ? "subtle" : "outline"}
                      size="sm"
                      title={t.tagline}
                      onClick={() => applyKnowledgeTemplate(t)}
                    >
                      {alreadyAdded && <Check className="size-3 text-ok" aria-hidden />}
                      Use: {t.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            {loadedKnowledgeTpl && (
              <p className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground/85">
                Loaded <span className="font-semibold">{loadedKnowledgeTpl}</span> into the editor. Replace {"{{Placeholders}}"} with your details, then click <span className="font-semibold">Add source</span>.
              </p>
            )}
            <form onSubmit={add} className="space-y-3" noValidate>
              <Field label="Source title" htmlFor="source-title" required counter={`${title.length} / 120`} error={srcErrors.title}>
                <Input ref={sourceTitleRef} id="source-title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setSrcErrors((s) => ({ ...s, title: undefined })); }} placeholder="Title, for example Refund policy" />
              </Field>
              <Field label="Source text" htmlFor="source-text" required counter={`${content.length.toLocaleString("en-US")} / 20,000`} error={srcErrors.content}>
                <Textarea id="source-text" rows={content.length > 260 ? 8 : 4} maxLength={20000} value={content} onChange={(e) => { setContent(e.target.value); setSrcErrors((s) => ({ ...s, content: undefined })); }} placeholder="Paste FAQs, policies or product details the agent should use." />
              </Field>
              {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="subtle" size="sm" disabled={busy}><Plus className="size-4" aria-hidden />{busy ? "Adding..." : "Add source"}</Button>
                {(title || content) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setTitle("");
                      setContent("");
                      setSrcErrors({});
                      setError(undefined);
                      setLoadedKnowledgeTpl(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </section>
      <KnowledgeTemplateModal
        open={knowledgeTplOpen}
        onClose={() => setKnowledgeTplOpen(false)}
        preferredCategory={form.category}
        activeTitle={title}
        activeContent={content}
        existingTitles={knowledge.map((k) => k.title)}
        usedChars={used}
        canApply={Boolean(agentId)}
        onApply={applyKnowledgeTemplate}
      />

      {botId && <BotKnowledge botId={botId} demo={demo} />}
    </div>
  );
}

const TOOL_ROWS: { key: keyof AgentTools; title: string; body: string }[] = [
  { key: "autoSearch", title: "Autonomous Live Web Search (Agentic)", body: "Automatically searches the live web on normal messages when fresh data, prices, news, exams, land rates, or scores are needed — no /search required." },
  { key: "marketData", title: "Live Market & Exchange Data (NSE / BSE / MSE)", body: "Fetches real-time NSE & BSE stock quotes, NIFTY/SENSEX indices, Gold, Forex, Crypto, and MSE context — single price or full breakdown." },
  { key: "webSearch", title: "Open Web Search (/search)", body: "Lets users run /search <topic> to fetch live open-web answers, tables, links, images and videos with citations." },
  { key: "datetime", title: "Date and time awareness", body: "Tells the agent the current date and time (UTC) so it can answer \"today\" and \"tomorrow\"." },
  { key: "matchLanguage", title: "Reply in the user's language", body: "Answers in the language the person writes in, even if it differs from the primary language." },
  { key: "mentionOnly", title: "Groups: reply only when mentioned", body: "In group chats the agent stays quiet unless someone mentions its @username." },
  { key: "typing", title: "Show typing indicator", body: "Shows \"typing...\" in Telegram while the model is working." },
];

/** Returns the first problem with the command list, or undefined when it is fine. Mirrors the server rules. */
export function validateCommands(list: AgentCommand[]): string | undefined {
  const seen = new Set<string>();
  for (const c of list) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(c.command)) return `/${c.command || "..."}: use 1-32 lowercase letters, digits or underscores, starting with a letter.`;
    if (RESERVED_COMMANDS.includes(c.command)) return `/${c.command} is built in. Choose another name.`;
    if (seen.has(c.command)) return `/${c.command} is used twice.`;
    seen.add(c.command);
    if (!c.description.trim()) return `/${c.command}: add a short description for the Telegram menu.`;
  }
  return undefined;
}

const KIND_LABEL: Record<AgentCommand["kind"], string> = {
  chat: "Chat reply",
  search: "Open Web Search",
  market: "Live Market (NSE/BSE/MSE)",
  brief: "Daily Intelligence Brief",
  image: "Generate image",
  describe: "Describe a photo",
};
const KIND_HINT: Record<AgentCommand["kind"], string> = {
  chat: "What should the model do with the text after the command?",
  search: "Optional focus for web research, e.g. Emphasize technical specs, pricing tables, and video tutorials.",
  market: "Optional focus for live stock/index lookups, e.g. Compare NSE vs BSE prices and include 52W range and latest news.",
  brief: "Default topic or watchlist when the user runs /brief with no arguments, e.g. NIFTY 50, SENSEX, RELIANCE, TCS.",
  image: "Optional style. Use {input} where the person's text goes, for example: A minimalist logo of {input}",
  describe: "What should the model look for? For example: Read all the text in this image.",
};
const PRESETS: AgentCommand[] = [
  { command: "stock", description: "Live NSE/BSE/MSE stock quote or full analysis", kind: "market", instruction: "Fetch live NSE/BSE/MSE stock prices; give single price or detailed breakdown as requested." },
  { command: "market", description: "NIFTY 50, SENSEX & Indian market overview", kind: "market", instruction: "Fetch live NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX and market headlines." },
  { command: "brief", description: "On-demand live intelligence briefing", kind: "brief", instruction: "" },
  { command: "search", description: "Search the web with details, images & videos", kind: "search", instruction: "" },
  { command: "imagine", description: "Generate an image from a description", kind: "image", instruction: "" },
  { command: "describe", description: "Describe a photo you send", kind: "describe", instruction: "Describe this image." },
  { command: "translate", description: "Translate text", kind: "chat", instruction: "Translate the text. Use the language the person names, or English if none is named." },
];

function CommandsEditor({ form, patch, imageModels = [] }: { form: AgentForm; patch: Patch; imageModels?: ModelDto[] }) {
  const problem = validateCommands(form.commands);
  const defaultImgSlug = imageModels.find((m) => m.slug === "flux-1-schnell")?.slug ?? imageModels[0]?.slug ?? null;
  const set = (i: number, p: Partial<AgentCommand>) => {
    const nextCmds = form.commands.map((c, j) => (j === i ? { ...c, ...p } : c));
    patch({
      commands: nextCmds,
      ...(p.kind === "image" && !form.imageModelSlug && defaultImgSlug ? { imageModelSlug: defaultImgSlug } : {}),
    });
  };
  const add = (c: AgentCommand) =>
    patch({
      commands: [...form.commands, c],
      ...(c.kind === "image" && !form.imageModelSlug && defaultImgSlug ? { imageModelSlug: defaultImgSlug } : {}),
    });
  const missing = PRESETS.filter((p) => !form.commands.some((c) => c.command === p.command));
  return (
    <section aria-labelledby="commands-title" className="space-y-3 rounded-2xl border border-border bg-surface-2/50 p-4">
      <div>
        <h3 id="commands-title" className="text-base font-bold">Commands</h3>
        <p className="text-xs text-muted">Slash commands people can use in Telegram. They appear in the bot&apos;s menu. /start, /help and /reset are built in.</p>
      </div>
      {form.commands.length > 0 && (
        <ul className="space-y-3">
          {form.commands.map((c, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border bg-surface/70 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
                <Input aria-label={`Command ${i + 1} name`} icon={<span className="text-sm font-semibold">/</span>} value={c.command} maxLength={32} spellCheck={false} autoCapitalize="none"
                  onChange={(e) => set(i, { command: e.target.value.toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_]/g, "") })} placeholder="imagine" />
                <Select aria-label={`Command ${i + 1} type`} value={c.kind} onChange={(e) => set(i, { kind: e.target.value as AgentCommand["kind"] })}>
                  {(Object.keys(KIND_LABEL) as AgentCommand["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </Select>
                <Button variant="ghost" size="sm" aria-label={`Remove /${c.command || "command"}`} onClick={() => patch({ commands: form.commands.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
              <Input aria-label={`Command ${i + 1} description`} value={c.description} maxLength={100} onChange={(e) => set(i, { description: e.target.value })} placeholder="Short description for the Telegram menu" />
              <Textarea aria-label={`Command ${i + 1} instruction`} rows={2} maxLength={1000} value={c.instruction} onChange={(e) => set(i, { instruction: e.target.value })} placeholder={KIND_HINT[c.kind]} />
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="alert" className="text-xs text-bad">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" disabled={form.commands.length >= 15} onClick={() => add({ command: "", description: "", kind: "chat", instruction: "" })}><Plus className="size-4" aria-hidden />Add command</Button>
        {missing.map((p) => <Button key={p.command} variant="outline" size="sm" disabled={form.commands.length >= 15} onClick={() => add(p)}>+ /{p.command}</Button>)}
      </div>
      {form.commands.some((c) => c.kind === "image") && !form.imageModelSlug && <p className="text-xs text-muted">Image commands will use FLUX.1 Schnell automatically (or choose another model in step 3).</p>}
    </section>
  );
}

export function StepTools({
  form,
  patch,
  imageModels = [],
  agentId = null,
  botConnected = false,
  demo = false,
  defaultBriefing,
}: {
  form: AgentForm;
  patch: Patch;
  imageModels?: ModelDto[];
  agentId?: string | null;
  botConnected?: boolean;
  demo?: boolean;
  defaultBriefing?: AgentDailyBriefingPreset;
}) {
  return (
    <div className="space-y-4">
      <Field label="Conversation memory" htmlFor="agent-memory" required hint="How many recent exchanges the agent remembers per chat. Use /reset in Telegram to clear it.">
        <Select id="agent-memory" value={String(form.memoryTurns)} onChange={(e) => patch({ memoryTurns: Number(e.target.value) })}>
          <option value="0">Off (each message stands alone)</option>
          <option value="5">Last 5 exchanges</option>
          <option value="10">Last 10 exchanges</option>
          <option value="20">Last 20 exchanges</option>
          {![0, 5, 10, 20].includes(form.memoryTurns) && <option value={String(form.memoryTurns)}>Last {form.memoryTurns} exchanges</option>}
        </Select>
      </Field>
      <ul className="divide-y divide-border/70 rounded-2xl border border-border bg-surface-2/50">
        {TOOL_ROWS.map((r) => (
          <li key={r.key} className="flex items-center gap-4 p-3.5">
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{r.title}</p><p className="text-xs text-muted">{r.body}</p></div>
            <Switch label={r.title} checked={form.tools[r.key]} onCheckedChange={(v) => patch({ tools: { ...form.tools, [r.key]: v } })} />
          </li>
        ))}
      </ul>
      <CommandsEditor form={form} patch={patch} imageModels={imageModels} />
      <AgentBriefingPanel
        agentId={agentId}
        botConnected={botConnected}
        category={form.category}
        defaultBriefing={defaultBriefing}
        demo={demo}
      />
    </div>
  );
}

export function StepTelegram({ agent, demo = false, onConnected, blockedMessage }: { agent: AiAgentDto | null; demo?: boolean; onConnected: (a: AiAgentDto) => void; blockedMessage?: string }) {
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function connect() {
    if (busy) return;
    if (demo) return setError("Demo mode: connect Supabase to connect a Telegram bot.");
    const t = token.trim();
    if (!t) return setError("Paste the bot token from BotFather.");
    if (!TOKEN_RE.test(t)) return setError("That does not look like a bot token. It looks like 123456789:AAH... (copy it from BotFather).");
    setBusy(true); setError(undefined);
    // Without an agent yet, the agent itself is created from the bot's Telegram identity (Telegram-first onboarding).
    const r = await api<AiAgentDto>(agent ? `/api/v1/ai-agents/${agent.id}/connect` : "/api/v1/ai-agents/connect-new", { body: { token: t } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setToken(""); onConnected(r.data);
  }

  if (agent?.botId) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
        <CheckCircle2 className="size-8 shrink-0 text-ok" aria-hidden />
        <div className="min-w-0 flex-1"><p className="font-bold">Telegram bot connected</p><p className="truncate text-sm text-muted">@{agent.username}</p></div>
        <a href={`https://t.me/${agent.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-lavender/60"><ExternalLink className="size-3.5" aria-hidden />Open</a>
      </div>
    );
  }
  return (
    <TelegramConnectCard
      token={token}
      onTokenChange={(v) => { setToken(v); setError(undefined); }}
      tokenError={error ?? blockedMessage}
      botName={agent?.name ?? ""}
      botNameReadOnly
      username={agent?.username}
      seedName={agent?.name}
      checking={busy}
      connected={false}
      onAction={() => void connect()}
      actionLabel="Connect Telegram bot"
      checkingLabel="Connecting..."
    />
  );
}

export function StepReview({
  form,
  agent,
  model,
  knowledgeCount,
  onActivate,
  activating,
  onSaveChanges,
  saving = false,
  hasChanges = false,
  error,
}: {
  form: AgentForm;
  agent: AiAgentDto | null;
  model: ModelDto | undefined;
  knowledgeCount: number;
  onActivate: () => void;
  activating: boolean;
  onSaveChanges?: () => void;
  saving?: boolean;
  hasChanges?: boolean;
  error?: string;
}) {
  const checks: { ok: boolean; label: string }[] = [
    { ok: Boolean(agent), label: "Agent saved" },
    { ok: Boolean(agent?.botId), label: agent?.botId ? `Telegram: @${agent.username}` : "Connect a Telegram bot (step 1)" },
    { ok: Boolean(model), label: model ? `Model: ${model.name}` : "Choose a model (step 3)" },
    { ok: form.instructions.trim().length >= INSTRUCTIONS_MIN, label: form.instructions.trim().length >= INSTRUCTIONS_MIN ? "Instructions written" : "Add instructions (step 4)" },
  ];
  const ready = checks.every((c) => c.ok);
  const active = agent?.status === "active";
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-sm">
            {c.ok ? <CheckCircle2 className="size-5 shrink-0 text-ok" aria-hidden /> : <XCircle className="size-5 shrink-0 text-bad" aria-hidden />}{c.label}
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2.5 text-sm">
        {[["Category", form.category], ["Language", form.language], ["Memory", form.memoryTurns ? `${form.memoryTurns} exchanges` : "Off"], ["Knowledge sources", String(knowledgeCount)], ["Commands", form.commands.length ? form.commands.map((c) => `/${c.command}`).join(" ") : "None"], ["Image model", form.imageModelSlug ?? "Auto (FLUX.1 Schnell)"]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface-2/60 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-muted">Try the agent in the Telegram preview on the right. It uses your last saved settings.</p>
      {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-bad">{error}</p>}
      {active ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 p-3 text-sm">
            <span className="flex items-center gap-2"><Badge tone="success" dot>Active</Badge>Your agent is live and answering messages on Telegram.</span>
            {agent?.botId && (
              <Link href={`/bots/${agent.botId}`} className="text-xs font-semibold text-lavender hover:underline">
                Manage Telegram Bot &rarr;
              </Link>
            )}
          </div>
          {onSaveChanges && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onSaveChanges} disabled={!ready || saving || !hasChanges}>
                <Save className="size-4" aria-hidden />{saving ? "Saving..." : hasChanges ? "Save Changes" : "All Changes Saved"}
              </Button>
              {agent?.username && (
                <a href={`https://t.me/${agent.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold hover:border-lavender/60">
                  <ExternalLink className="size-4" aria-hidden />Open in Telegram
                </a>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onActivate} disabled={!ready || activating} title={ready ? undefined : "Finish the items marked in red first."}>{activating ? "Activating..." : "Create & Activate Agent"}</Button>
          {onSaveChanges && hasChanges && (
            <Button variant="outline" onClick={onSaveChanges} disabled={saving}>
              <Save className="size-4" aria-hidden />{saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
