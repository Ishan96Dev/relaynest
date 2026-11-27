"use client";

import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Code2, FileText, Layers, LayoutTemplate, Pencil,
  Plus, Rocket, Sparkles, Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import { BotAvatar } from "@/components/bots/bot-avatar";
import {
  ResponseTemplateModal,
  ResponseTemplateQuickBar,
  type ResponseTemplatePatch,
} from "@/components/bots/response-template-picker";
import { TelegramConnectCard } from "@/components/bots/telegram-connect-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ImportPicker } from "@/components/bots/import-picker";
import { parseBotImport, type BotImport } from "@/lib/agent-templates";
import { demoTemplates, templateMessages } from "@/lib/demo-data";
import { STANDARD_RESPONSE_TEMPLATES } from "@/lib/response-templates";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

const STEPS = ["Connect Telegram", "Choose Method", "Configuration", "Commands", "Review & Publish"] as const;
const TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{30,50}$/;
const CMD_RE = /^\/?[a-z0-9_]{1,32}$/i;

interface Cmd { command: string; description: string; response: string; enabled: boolean; builtin: boolean }
interface Verified { username: string; displayName: string }
type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: json?.error?.message ?? "Request failed." };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

const normalize = (c: string) => (c.startsWith("/") ? c : `/${c}`).toLowerCase();

export function BotWizard() {
  const params = useSearchParams();
  const tpl = demoTemplates.find((t) => t.id === params.get("template"));

  const [step, setStep] = React.useState(0);
  const [method, setMethod] = React.useState<"template" | "custom">(tpl ? "template" : "template");
  const [token, setToken] = React.useState("");
  const [verified, setVerified] = React.useState<Verified | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [tokenError, setTokenError] = React.useState<string>();
  const [name, setName] = React.useState(tpl?.name.replace(/\s/g, "") ?? "");
  const [displayName, setDisplayName] = React.useState(tpl?.name ?? "");
  const [description, setDescription] = React.useState(tpl?.description ?? "");
  const [category, setCategory] = React.useState(tpl?.category ?? "");
  const [welcome, setWelcome] = React.useState(tpl?.welcomeMessage ?? (tpl && templateMessages[tpl.id]?.welcomeMessage) ?? "Hello! I'm here to help. How can I help you today?");
  const [fallback, setFallback] = React.useState(tpl?.defaultResponse ?? (tpl && templateMessages[tpl.id]?.defaultResponse) ?? "Sorry, I didn't understand that. Type /help to see available commands.");
  const [errs, setErrs] = React.useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [respTplOpen, setRespTplOpen] = React.useState(false);
  const [filled, setFilled] = React.useState<string>();
  const [commandsOn, setCommandsOn] = React.useState(true);
  const [commands, setCommands] = React.useState<Cmd[]>(() => {
    const base: Cmd[] = [
      { command: "/start", description: "Start the conversation with a welcome message", response: "", enabled: true, builtin: true },
      { command: "/help", description: "Show information and available commands", response: "", enabled: true, builtin: true },
      { command: "/about", description: "Show information about this bot", response: "", enabled: true, builtin: true },
    ];
    const extra = (tpl?.commands ?? []).filter((c) => !base.some((b) => b.command === c.command)).map((c) => ({ command: c.command, description: c.description, response: "", enabled: true, builtin: false }));
    return [...base, ...extra];
  });
  const [editing, setEditing] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string>();
  const [created, setCreated] = React.useState<{ id: string; username: string } | null>(null);

  const tokenShapeOk = TOKEN_RE.test(token.trim());
  const custom = commands.filter((c) => !c.builtin);

  async function validate() {
    if (!token.trim() || !tokenShapeOk) { setErrs((e) => ({ ...e, token: token.trim() ? "That does not look like a bot token. Example: 123456789:AAH..." : "Paste the bot token from BotFather." })); return; }
    setChecking(true); setTokenError(undefined); setVerified(null);
    const r = await api<{ username: string; displayName: string }>("/api/v1/bots/validate-token", { method: "POST", body: JSON.stringify({ token: token.trim() }) });
    setChecking(false);
    if (r.ok) {
      setVerified({ username: r.data.username, displayName: r.data.displayName });
      setName((n) => n || r.data.displayName);
      setDisplayName((n) => n || r.data.displayName);
    } else setTokenError(r.message);
  }

  async function create() {
    setSubmitting(true); setSubmitError(undefined);
    const bot = await api<{ id: string; username: string | null }>("/api/v1/bots", {
      method: "POST",
      body: JSON.stringify({ name: displayName.trim() || name.trim(), description, token: token.trim(), welcomeMessage: welcome, defaultResponse: fallback, category: category || tpl?.category }),
    });
    if (!bot.ok) { setSubmitting(false); setSubmitError(bot.message); return; }

    if (commandsOn) {
      const list = commands.filter((c) => c.enabled).map((c) => ({
        command: c.command.replace(/^\//, ""),
        description: c.description || undefined,
        responseText: c.response.trim() || (c.command === "/start" ? welcome : c.description || "Thanks for your message."),
        enabled: true,
      }));
      if (list.length) {
        const r = await api<unknown>(`/api/v1/bots/${bot.data.id}/commands`, { method: "POST", body: JSON.stringify({ commands: list }) });
        if (!r.ok) { setSubmitting(false); setSubmitError(`The bot was created, but its commands could not be saved: ${r.message}`); setCreated({ id: bot.data.id, username: bot.data.username ?? "" }); return; }
      }
    }
    setSubmitting(false);
    toast.success("Bot created");
    setToken("");
    setCreated({ id: bot.data.id, username: bot.data.username ?? verified?.username ?? "" });
  }

  function reset() {
    setCreated(null); setStep(0); setToken(""); setVerified(null); setTokenError(undefined); setSubmitError(undefined);
    setName(""); setDisplayName(""); setDescription(""); setEditing(null);
  }

  const clearErr = (...keys: string[]) => setErrs((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));

  /** Short, field-level messages for the current step. An empty object means the step can continue. */
  function stepErrors(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!token.trim()) e.token = "Paste the bot token from BotFather.";
      else if (!tokenShapeOk) e.token = "That does not look like a bot token. Example: 123456789:AAH...";
      else if (!verified) e.token = "Validate the token to continue.";
      if (!name.trim()) e.name = "Enter a name for your bot.";
    }
    if (s === 2) {
      if (!displayName.trim()) e.displayName = "Enter a display name.";
      if (!welcome.trim()) e.welcome = "Write the message sent when someone starts the bot.";
      if (!fallback.trim()) e.fallback = "Write the reply for messages the bot does not understand.";
    }
    if (s === 3 && commandsOn) {
      commands.forEach((c, i) => {
        if (!CMD_RE.test(c.command.trim()) || normalize(c.command.trim()) === "/") e[`cmd${i}`] = "Use 1-32 letters, digits or underscores.";
        else if (commands.some((o, j) => j !== i && normalize(o.command.trim()) === normalize(c.command.trim()))) e[`cmd${i}`] = "Command names must be unique.";
      });
    }
    return e;
  }
  function tryNext() {
    const found = stepErrors(step);
    setErrs(found);
    const keys = Object.keys(found);
    if (!keys.length) { setStep(step + 1); setFilled(undefined); return; }
    const badCmd = keys.find((k) => k.startsWith("cmd"));
    if (badCmd) setEditing(Number(badCmd.replace(/\D/g, "")));
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[aria-invalid=\"true\"]");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  }
  function applyBot(b: BotImport, label: string) {
    if (b.name) { setName(b.name.replace(/\s/g, "")); setDisplayName(b.name); }
    if (b.description !== undefined) setDescription(b.description);
    if (b.welcomeMessage) setWelcome(b.welcomeMessage);
    if (b.defaultResponse) setFallback(b.defaultResponse);
    if (b.commands.length) {
      setCommands((l) => {
        const keep = l.filter((c) => c.builtin);
        const extra = b.commands.filter((c) => !keep.some((k) => normalize(k.command) === normalize(c.command))).map((c) => ({ command: c.command, description: c.description, response: "", enabled: true, builtin: false }));
        return [...keep, ...extra];
      });
    }
    setErrs({}); setCommandsOn(true);
    setFilled(`Filled from ${label}. You can edit everything in the next steps.`);
  }
  function applyTemplate(id: string) {
    const t = demoTemplates.find((x) => x.id === id);
    if (!t) return;
    setCategory(t.category);
    const m = templateMessages[t.id];
    applyBot({ name: t.name, description: t.description, welcomeMessage: t.welcomeMessage ?? m?.welcomeMessage, defaultResponse: t.defaultResponse ?? m?.defaultResponse, commands: t.commands }, `the "${t.name}" template`);
  }
  function applyResponseTemplate(patch: ResponseTemplatePatch) {
    if (patch.welcomeMessage !== undefined) {
      setWelcome(patch.welcomeMessage);
      clearErr("welcome");
    }
    if (patch.fallbackMessage !== undefined) {
      setFallback(patch.fallbackMessage);
      clearErr("fallback");
    }
  }
  const errorCount = Object.keys(errs).length;

  if (created) {
    return (
      <Card glow className="mx-auto max-w-md p-8 text-center">
        <span className="pop-in rn-icon-float grid-cols-1 mx-auto grid size-24 place-items-center rounded-full border-4 border-success/80 text-ok shadow-[0_0_40px_-6px_rgb(var(--rn-success))]" aria-hidden><Check className="size-12" strokeWidth={3} /></span>
        <h2 className="mt-5 text-2xl font-extrabold">Bot Created Successfully! <span aria-hidden className="emoji-party">&#127881;</span></h2>
        <p className="mt-1 text-sm text-foreground/80">Your Telegram bot has been created and is ready to use.</p>
        {submitError && <p role="alert" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warn">{submitError}</p>}
        <div className="panel mt-5 flex items-center gap-3 p-3 text-left">
          <BotAvatar name={displayName || name} className="size-12" />
          <div className="min-w-0 flex-1 leading-tight"><p className="font-bold">{displayName || name}</p><p className="text-sm text-muted">@{created.username}</p></div>
          <Badge tone="warning" dot>Draft</Badge>
        </div>
        <p className="mt-3 text-xs text-muted">Open the bot to activate it and register its Telegram webhook.</p>
        <ButtonLink href={`/bots/${created.id}`} className="mt-5 w-full">Open Bot <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        <Button variant="outline" className="mt-3 w-full" onClick={reset}>Create Another Bot</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol aria-label="Progress" className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-5 sm:p-5">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="relative flex flex-col items-center gap-1.5 text-center">
            {i < STEPS.length - 1 && (
              <ChevronRight className="pointer-events-none absolute -right-2.5 top-2 hidden size-4 text-muted/60 sm:block" aria-hidden />
            )}
            <span className={cn("grid size-8 place-items-center rounded-full border text-sm font-bold transition",
              i < step ? "border-success/60 bg-success/15 text-ok" : i === step ? "btn-primary-bg border-transparent text-white shadow-[0_0_18px_-2px_rgb(var(--rn-primary))]" : "border-border bg-surface text-muted")}>
              {i < step ? <Check className="size-4" aria-label="Completed" /> : i + 1}
            </span>
            <span className={cn("text-xs font-semibold sm:text-sm", i === step ? "text-lavender" : "text-muted")}>{s}</span>
          </li>
        ))}
      </ol>

      <Card glow className="p-6 sm:p-8">
        <p className="mb-1 text-xs font-semibold text-muted">Step {step + 1} of 5</p>

        {step === 1 && (
          <section>
            <h2 className="text-2xl font-extrabold">Choose How You Want to Set Up Your Bot</h2>
            <p className="mt-1 text-sm text-foreground/80">Select a method that best fits your needs.</p>
            <div role="radiogroup" aria-label="Creation method" className="grid-cols-1 mt-6 grid gap-4 sm:grid-cols-2">
              {([
                { id: "template", icon: Layers, title: "Use a Template", desc: "Start with a preconfigured bot template (e.g. Support, FAQ, Notifications) and customize it.", rec: true },
                { id: "custom", icon: Code2, title: "Create Custom Bot", desc: "Configure your bot from scratch with full control over commands, responses and features." },
              ] as const).map((o) => (
                <button key={o.id} role="radio" aria-checked={method === o.id} onClick={() => setMethod(o.id)}
                  className={cn("relative rounded-2xl border p-6 text-left transition", method === o.id ? "border-lavender bg-primary/15 shadow-[0_0_30px_-10px_rgb(var(--rn-primary))]" : "border-border bg-surface-2/60 hover:border-lavender/50")}>
                  <div className="flex items-start justify-between">
                    <IconTile size="xl" tone="primary"><o.icon /></IconTile>
                    <span className="flex items-center gap-2">{"rec" in o && <Badge tone="primary">Recommended</Badge>}
                      <span className={cn("grid size-5 place-items-center rounded-full border-2", method === o.id ? "border-lavender" : "border-border")}>{method === o.id && <span className="size-2.5 rounded-full bg-lavender" />}</span></span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{o.title}</h3>
                  <p className="mt-1 text-sm text-foreground/75">{o.desc}</p>
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="flex min-w-0 items-center gap-2 text-sm text-foreground/85"><Sparkles className="size-4 shrink-0 text-lavender" aria-hidden />{filled ?? (tpl ? `Using template: ${tpl.name}. Review it in the next steps.` : "Pick a template or import a JSON file to auto-fill the name, messages and commands.")}</p>
              <span className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>Templates &amp; import</Button><ButtonLink href="/bots/templates" variant="ghost" size="sm">Browse all</ButtonLink></span>
            </div>
          </section>
        )}

        {step === 0 && (
          <section>
            <h2 className="text-2xl font-extrabold">Connect Your Telegram Bot</h2>
            <p className="mt-1 mb-5 text-sm text-foreground/80">Start by connecting the bot you made in BotFather. Its name, username and profile photo are imported, then you refine everything in the next steps.</p>
            <TelegramConnectCard
              token={token}
              onTokenChange={(v) => { setToken(v); setVerified(null); setTokenError(undefined); clearErr("token"); }}
              tokenError={errs.token ?? tokenError}
              botName={name}
              onBotNameChange={(v) => { setName(v); clearErr("name"); }}
              botNameError={errs.name}
              username={verified?.username}
              seedName={displayName || name}
              checking={checking}
              connected={Boolean(verified)}
              onAction={validate}
              onRevalidate={validate}
              revalidating={checking}
            />
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="text-2xl font-extrabold">Configure Your Bot</h2>
            <p className="mt-1 text-sm text-foreground/80">Set up the basic information, messages and bot features.</p>
            <div className="grid-cols-1 mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Bot Display Name" htmlFor="name" required error={errs.displayName}><Input id="name" maxLength={50} value={displayName} onChange={(e) => { setDisplayName(e.target.value); clearErr("displayName"); }} /></Field>
              <Field label="Description (optional)" htmlFor="desc" counter={`${description.length} / 200`}><Textarea id="desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" /></Field>
            </div>
            <div className="mt-5 space-y-3 border-t border-border/70 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">Automatic Responses</h3>
                  <p className="text-xs text-muted">Messages sent when a user starts the bot or sends an unknown message.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setRespTplOpen(true)}>
                  <LayoutTemplate className="size-3.5 text-lavender" aria-hidden />
                  Browse {STANDARD_RESPONSE_TEMPLATES.length} response templates
                </Button>
              </div>
              <div className="grid-cols-1 grid gap-4 md:grid-cols-2">
                <Field label="Welcome Message" htmlFor="welcome" required error={errs.welcome} counter={`${welcome.length} / 4096`} hint="Sent when someone starts the bot."><Textarea id="welcome" rows={5} maxLength={4096} value={welcome} onChange={(e) => { setWelcome(e.target.value); clearErr("welcome"); }} /></Field>
                <Field label="Default Response" htmlFor="fallback" required error={errs.fallback} counter={`${fallback.length} / 4096`} hint="Sent when the bot does not understand a message."><Textarea id="fallback" rows={5} maxLength={4096} value={fallback} onChange={(e) => { setFallback(e.target.value); clearErr("fallback"); }} /></Field>
              </div>
              <ResponseTemplateQuickBar
                scope="standard"
                botName={displayName || name}
                activeWelcome={welcome}
                activeFallback={fallback}
                preferredCategory={category || tpl?.category}
                onApply={applyResponseTemplate}
                onOpenModal={() => setRespTplOpen(true)}
              />
            </div>
            <div className="panel mt-4 flex items-center justify-between gap-4 p-4">
              <div><p className="font-semibold">Enable Commands</p><p className="text-xs text-foreground/75">Allow users to use bot commands (e.g. /start, /help).</p></div>
              <Switch label="Enable commands" checked={commandsOn} onCheckedChange={setCommandsOn} />
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="text-2xl font-extrabold">Configure Bot Commands</h2>
            <p className="mt-1 text-sm text-foreground/80">Set up commands and responses for your bot.</p>
            {!commandsOn ? <p className="panel mt-5 p-4 text-sm text-foreground/80">Commands are turned off. Go back to Configuration to enable them.</p> : (
              <>
                <ul className="mt-5 space-y-2.5">
                  {commands.map((c, i) => (
                    <li key={i} className="panel p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-2"><IconTile size="sm" tone="primary"><Code2 /></IconTile></span>
                        {editing === i ? (
                          <Input aria-label="Command" aria-invalid={Boolean(errs[`cmd${i}`])} className="w-40 font-mono" value={c.command} onChange={(e) => { setCommands((l) => l.map((x, j) => j === i ? { ...x, command: e.target.value } : x)); clearErr(`cmd${i}`); }} />
                        ) : <code className="rounded-md bg-primary/25 px-2 py-0.5 text-sm font-bold text-lavender">{normalize(c.command)}</code>}
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{c.description}</span>
                        <Switch label={`Enable ${c.command}`} checked={c.enabled} onCheckedChange={(v) => setCommands((l) => l.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
                        <button aria-label={`Edit ${c.command}`} aria-pressed={editing === i} onClick={() => setEditing(editing === i ? null : i)} className="grid-cols-1 grid size-8 place-items-center rounded-md text-lavender hover:bg-foreground/5"><Pencil className="size-4" /></button>
                        <button aria-label={`Remove ${c.command}`} onClick={() => { setCommands((l) => l.filter((_, j) => j !== i)); setEditing(null); }} className="grid-cols-1 grid size-8 place-items-center rounded-md text-bad hover:bg-danger/10"><Trash2 className="size-4" /></button>
                      </div>
                      {editing === i && (
                        <div className="grid-cols-1 mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                          <Field label="Description" htmlFor={`d${i}`}><Input id={`d${i}`} value={c.description} maxLength={256} onChange={(e) => setCommands((l) => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></Field>
                          <Field label="Response" htmlFor={`r${i}`} hint={c.command === "/start" && !c.response ? "Defaults to the welcome message." : undefined}><Textarea id={`r${i}`} value={c.response} maxLength={4096} className="min-h-16" onChange={(e) => setCommands((l) => l.map((x, j) => j === i ? { ...x, response: e.target.value } : x))} /></Field>
                        </div>
                      )}
                      {(errs[`cmd${i}`] || !CMD_RE.test(c.command)) && <p role="alert" className="mt-2 flex items-center gap-1 text-xs font-medium text-bad"><AlertCircle className="size-3.5 shrink-0" aria-hidden />{errs[`cmd${i}`] ?? "Use 1-32 letters, digits or underscores."}</p>}
                    </li>
                  ))}
                </ul>
                
                <div className="mt-4 flex items-center justify-between"><h3 className="font-bold">Custom Commands</h3>
                  <Button size="sm" variant="subtle" onClick={() => { setCommands((l) => [...l, { command: "/", description: "", response: "", enabled: true, builtin: false }]); setEditing(commands.length); }}><Plus className="size-4" />Add Command</Button></div>
                {custom.length === 0 && <p className="mt-2 text-xs text-muted">No custom commands yet.</p>}
              </>
            )}
          </section>
        )}

        {step === 4 && (
          <section>
            <h2 className="text-2xl font-extrabold">Review &amp; Publish</h2>
            <p className="mt-1 text-sm text-foreground/80">Review your configuration and create your bot.</p>
            <div className="panel mt-5 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Bot Details</h3><button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm font-semibold text-lavender hover:underline"><Pencil className="size-3.5" aria-hidden />Edit</button></div>
              <div className="flex items-center gap-3 border-b border-border/60 pb-3"><BotAvatar name={displayName || name} className="size-14" /><div className="leading-tight"><p className="text-lg font-bold">{displayName || name}</p><p className="text-sm text-muted">@{verified?.username}</p></div><Badge tone="success" className="ml-2">Ready to Create</Badge></div>
              <dl className="divide-y divide-border/50 text-sm">
                {[["Description", description || "-"], ["Welcome Message", welcome], ["Default Response", fallback], ["Commands", commandsOn ? `${commands.filter((c) => c.enabled && c.builtin).length} default + ${commands.filter((c) => c.enabled && !c.builtin).length} custom` : "Off"]].map(([k, v]) => (
                  <div key={k} className="grid-cols-1 grid grid-cols-[140px_1fr] gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd className="break-words">{v}</dd></div>
                ))}
                <div className="grid-cols-1 grid grid-cols-[140px_1fr] gap-3 py-2.5"><dt className="text-muted">Features</dt><dd className="flex flex-wrap gap-2">{commandsOn && <Badge tone="success"><Check className="size-3" aria-hidden />Commands</Badge>}</dd></div>
              </dl>
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm"><FileText className="size-4 text-info" aria-hidden />After creating, open the bot to activate it and register its Telegram webhook.</p>
            {submitError && <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-bad"><AlertTriangle className="size-4 shrink-0" aria-hidden />{submitError}</div>}
          </section>
        )}

        {errorCount > 0 && <p role="alert" className="mt-6 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-bad"><AlertCircle className="size-4 shrink-0" aria-hidden />{errorCount === 1 ? "1 field needs your attention. It is highlighted in red above." : `${errorCount} fields need your attention. They are highlighted in red above.`}</p>}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          {step === 0 ? <ButtonLink href="/bots" variant="outline"><ArrowLeft className="size-4" />Cancel</ButtonLink> : <Button variant="outline" onClick={() => { setStep(step - 1); setErrs({}); }}><ArrowLeft className="size-4" />Back</Button>}
          {step < 4 ? (
            <Button onClick={tryNext}>Continue<ArrowRight className="size-4" /></Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled title="Saving drafts is not available yet.">Save as Draft</Button>
              <Button variant="outline" disabled title="Configuration testing is not available yet.">Test Configuration</Button>
              <Button onClick={create} disabled={submitting}><Rocket className="size-4" />{submitting ? "Creating..." : "Create Bot"}</Button>
            </div>
          )}
        </div>
      </Card>
      <ImportPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title="Auto-fill your bot" fields="name, description, welcomeMessage, defaultResponse, commands"
        templates={demoTemplates.map((t) => ({ id: t.id, name: t.name, tagline: t.description, category: t.category }))}
        example={JSON.stringify({ name: "Acme Helper", description: "Answers questions about Acme.", welcomeMessage: "Hi! How can I help?", defaultResponse: "Sorry, try /help.", commands: [{ command: "/pricing", description: "Show pricing" }] }, null, 2)}
        onPickTemplate={applyTemplate} parse={parseBotImport} onImport={(b) => applyBot(b, "your imported file")} />
      <ResponseTemplateModal
        open={respTplOpen}
        onClose={() => setRespTplOpen(false)}
        scope="standard"
        botName={displayName || name}
        activeWelcome={welcome}
        activeFallback={fallback}
        preferredCategory={category || tpl?.category}
        onApply={applyResponseTemplate}
      />
    </div>
  );
}