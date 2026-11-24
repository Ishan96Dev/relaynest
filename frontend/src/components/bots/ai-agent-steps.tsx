"use client";
import { AlertCircle, Bot, Check, CheckCircle2, ExternalLink, Plus, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { AgentTools } from "@backend/server/ai/agent";
import { RESERVED_COMMANDS, type AgentCommand } from "@backend/lib/validation/schemas";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import type { AiAgentDto, KnowledgeDto } from "@backend/server/services/ai-agents";
import { ProviderMark } from "@/components/ai/provider-mark";
import { TelegramConnectCard } from "@/components/bots/telegram-connect-card";
import { TelegramUsernameChecker } from "@/components/bots/telegram-username-check";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileUpload, type PendingImage } from "@/components/ui/file-upload";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { formatTokens } from "@/lib/model-format";
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
export const CATEGORIES = ["Community Manager", "Customer Support", "Sales Assistant", "FAQ Assistant", "Productivity", "Education", "Entertainment", "Other"];
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
        <Field label="Image model (optional)" htmlFor="agent-image-model" hint="Used by image commands such as /imagine. Leave empty if your agent should not draw.">
          <Select id="agent-image-model" value={form.imageModelSlug ?? ""} onChange={(e) => patch({ imageModelSlug: e.target.value || null })}>
            <option value="">None</option>
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

const TEMPLATES: { label: string; text: string }[] = [
  { label: "Support agent", text: "Answer customer questions politely and briefly. Use the reference material first. If you cannot help, ask the person to contact support and never invent policies, prices or order details." },
  { label: "FAQ assistant", text: "Answer frequently asked questions using only the reference material. If the answer is not there, say you do not know and suggest where to look." },
  { label: "Community manager", text: "Welcome new members, answer questions about the community, and keep a friendly, neutral tone. Politely decline off-topic or abusive requests." },
];

export function StepKnowledge({ form, patch, errors, agentId, knowledge, onKnowledge }: {
  form: AgentForm; patch: Patch; errors: FieldErrors; agentId: string | null; knowledge: KnowledgeDto[]; onKnowledge: (k: KnowledgeDto[]) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [srcErrors, setSrcErrors] = React.useState<{ title?: string; content?: string }>({});
  const used = knowledge.reduce((n, k) => n + k.content.length, 0);

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
    onKnowledge([...knowledge, r.data]); setTitle(""); setContent("");
  }
  async function remove(id: string) {
    if (!agentId) return;
    const r = await api<void>(`/api/v1/ai-agents/${agentId}/knowledge/${id}`, { method: "DELETE" });
    if (r.ok) onKnowledge(knowledge.filter((k) => k.id !== id)); else setError(r.message);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <Field label="Instructions" htmlFor="agent-instructions" required error={errors.instructions} counter={`${form.instructions.length} / 8000`}
          hint={`Tell the agent who it is, what it should do and what it must avoid. At least ${INSTRUCTIONS_MIN} characters.`}>
          <Textarea id="agent-instructions" rows={6} maxLength={8000} value={form.instructions} onChange={(e) => patch({ instructions: e.target.value })} placeholder="You help customers of Acme with orders and shipping..." />
        </Field>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Instruction templates">
          {TEMPLATES.map((t) => <Button key={t.label} variant="outline" size="sm" onClick={() => patch({ instructions: t.text })}>Use: {t.label}</Button>)}
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="Welcome message" htmlFor="agent-welcome" hint="Optional. Sent when someone starts the bot with /start.">
          <Textarea id="agent-welcome" rows={3} maxLength={1000} value={form.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value })} placeholder="Hi! I'm here to help. Ask me anything." />
        </Field>
        <Field label="Fallback message" htmlFor="agent-fallback" hint="Optional. Sent when the model cannot answer, for example during an outage.">
          <Textarea id="agent-fallback" rows={3} maxLength={1000} value={form.fallbackMessage} onChange={(e) => patch({ fallbackMessage: e.target.value })} placeholder="Sorry, I couldn't answer that right now." />
        </Field>
      </div>

      <section aria-labelledby="knowledge-title" className="rounded-2xl border border-border bg-surface-2/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="knowledge-title" className="text-base font-bold">Knowledge sources <span className="text-xs font-normal text-muted">(optional)</span></h3>
          <span className="text-xs text-muted">{used.toLocaleString("en-US")} characters (the first 24,000 are used)</span>
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
            <form onSubmit={add} className="space-y-3" noValidate>
              <Field label="Source title" htmlFor="source-title" required error={srcErrors.title}>
                <Input id="source-title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setSrcErrors((s) => ({ ...s, title: undefined })); }} placeholder="Title, for example Refund policy" />
              </Field>
              <Field label="Source text" htmlFor="source-text" required error={srcErrors.content}>
                <Textarea id="source-text" rows={4} maxLength={20000} value={content} onChange={(e) => { setContent(e.target.value); setSrcErrors((s) => ({ ...s, content: undefined })); }} placeholder="Paste FAQs, policies or product details the agent should use." />
              </Field>
              {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
              <Button type="submit" variant="subtle" size="sm" disabled={busy}><Plus className="size-4" aria-hidden />{busy ? "Adding..." : "Add source"}</Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

const TOOL_ROWS: { key: keyof AgentTools; title: string; body: string }[] = [
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

const KIND_LABEL: Record<AgentCommand["kind"], string> = { chat: "Chat reply", image: "Generate image", describe: "Describe a photo" };
const KIND_HINT: Record<AgentCommand["kind"], string> = {
  chat: "What should the model do with the text after the command?",
  image: "Optional style. Use {input} where the person&apos;s text goes, for example: A minimalist logo of {input}",
  describe: "What should the model look for? For example: Read all the text in this image.",
};
const PRESETS: AgentCommand[] = [
  { command: "imagine", description: "Generate an image from a description", kind: "image", instruction: "" },
  { command: "describe", description: "Describe a photo you send", kind: "describe", instruction: "Describe this image." },
  { command: "translate", description: "Translate text", kind: "chat", instruction: "Translate the text. Use the language the person names, or English if none is named." },
];

function CommandsEditor({ form, patch }: { form: AgentForm; patch: Patch }) {
  const problem = validateCommands(form.commands);
  const set = (i: number, p: Partial<AgentCommand>) => patch({ commands: form.commands.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const add = (c: AgentCommand) => patch({ commands: [...form.commands, c] });
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
      {form.commands.some((c) => c.kind === "image") && !form.imageModelSlug && <p className="text-xs text-warn">Image commands need an image model. Choose one in step 2.</p>}
    </section>
  );
}

export function StepTools({ form, patch }: { form: AgentForm; patch: Patch }) {
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
      <CommandsEditor form={form} patch={patch} />
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

export function StepReview({ form, agent, model, knowledgeCount, onActivate, activating, error }: {
  form: AgentForm; agent: AiAgentDto | null; model: ModelDto | undefined; knowledgeCount: number; onActivate: () => void; activating: boolean; error?: string;
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
        {[["Category", form.category], ["Language", form.language], ["Memory", form.memoryTurns ? `${form.memoryTurns} exchanges` : "Off"], ["Knowledge sources", String(knowledgeCount)], ["Commands", form.commands.length ? form.commands.map((c) => `/${c.command}`).join(" ") : "None"], ["Image model", form.imageModelSlug ?? "None"]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface-2/60 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-muted">Try the agent in the Telegram preview on the right. It uses your last saved settings.</p>
      {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-bad">{error}</p>}
      {active ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm"><Badge tone="success" dot>Active</Badge>Your agent is answering messages on Telegram.</p>
      ) : (
        <Button onClick={onActivate} disabled={!ready || activating} title={ready ? undefined : "Finish the items marked in red first."}>{activating ? "Activating..." : "Create & Activate Agent"}</Button>
      )}
    </div>
  );
}
