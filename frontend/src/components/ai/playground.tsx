"use client";
/* The generated image is a base64 data URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import { ArrowUp, BookOpen, Bot, BrainCircuit, Eraser, Loader2, Sparkles, User } from "lucide-react";
import * as React from "react";
import { executionMode, type ModelDto } from "@backend/server/ai/model-catalog";
import { ImageResult } from "@/components/ai/image-result";
import { ProviderMark } from "@/components/ai/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatTokens } from "@/lib/model-format";
import { cn } from "@/lib/utils";

interface Usage { promptTokens: number; completionTokens: number; totalTokens: number }
type RunResult =
  | { kind: "chat"; text: string; usage: Usage; ms: number; sources?: { document: string; collection: string; score: number }[]; retrieval?: "vector" | "keyword" | "none" }
  | { kind: "embedding"; dimensions: number; preview: number[]; norm: number; usage: Usage; ms: number }
  | { kind: "image"; imageBase64: string; ms: number }
  | { kind: "decision"; probability: number; ms: number };

interface Turn { role: "user" | "assistant"; content: string; meta?: string; sources?: string[] }
export interface PlaygroundCollection { id: string; name: string; documents: number }

/** Opens on a model that answers quickly on the free NVIDIA tier; others can queue for a minute or more. */
const FAST_DEFAULT = "nemotron-3-5-lightning-30b-a3b";

const MODE_LABEL = { chat: "Chat", embedding: "Embeddings", image: "Image generation", decision: "Decision" } as const;

export function Playground({ models, initialSlug, collections = [] }: { models: ModelDto[]; initialSlug?: string; collections?: PlaygroundCollection[] }) {
  const [kb, setKb] = React.useState<string[]>([]);
  const [image, setImage] = React.useState<string | null>(null);
  const [slug, setSlug] = React.useState(() => (models.some((m) => m.slug === initialSlug) ? initialSlug! : (models.find((m) => m.slug === FAST_DEFAULT) ?? models.find((m) => m.isFeatured) ?? models[0])?.slug ?? ""));
  const model = models.find((m) => m.slug === slug);
  const mode = model ? executionMode(model) : "chat";

  const [system, setSystem] = React.useState("");
  const [temperature, setTemperature] = React.useState(model?.defaultTemperature ?? 0.5);
  const [maxTokens, setMaxTokens] = React.useState(String(model?.defaultMaxTokens ?? 1024));
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [text, setText] = React.useState("");
  const [inputType, setInputType] = React.useState<"query" | "passage">("query");
  const [prompt, setPrompt] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [fe, setFe] = React.useState<{ prompt?: string; text?: string; question?: string }>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [result, setResult] = React.useState<RunResult | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);
  // Switching model starts a clean session, since each model is a different conversation partner.
  React.useEffect(() => {
    setTurns([]); setResult(null); setError(undefined); setImage(null);
    // Each model has the temperature and reply length that suit it; thinking models need a big token budget.
    const m = models.find((x) => x.slug === slug);
    if (m) { setTemperature(m.defaultTemperature); setMaxTokens(String(m.defaultMaxTokens)); }
  }, [slug, models]);

  async function run(body: Record<string, unknown>) {
    setBusy(true); setError(undefined);
    const r = await api<RunResult>("/api/v1/ai/run", { body });
    setBusy(false);
    if (!r.ok) { setError(r.message); return null; }
    return r.data;
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || busy || !model) return;
    if (model.slug === "paligemma" && !image) return setError("Attach an image first. PaliGemma describes pictures.");
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next); setDraft("");
    const r = await run({ kind: "chat", model: model.slug, system: system.trim() || undefined, messages: next.map(({ role, content: c }) => ({ role, content: c })), temperature, maxTokens: Number(maxTokens), ...(kb.length ? { collectionIds: kb } : {}), ...(image ? { image } : {}) });
    if (r?.kind === "chat") setTurns([...next, { role: "assistant", content: r.text, meta: `${(r.ms / 1000).toFixed(1)}s \u2022 ${r.usage.totalTokens || "?"} tokens${r.retrieval === "vector" ? " \u2022 vector search" : r.retrieval === "keyword" ? " \u2022 keyword search" : ""}`, sources: r.sources?.length ? [...new Set(r.sources.map((s) => `${s.document}`))] : undefined }]);
    else { setTurns(next.slice(0, -1)); setDraft(content); } // restore the prompt so a failed call is not lost
  }

  /** Shrinks a picked image to a small JPEG, because NVIDIA's vision route only accepts about 180 KB inline. */
  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    if (!file.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG or WebP).");
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 448 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale)); canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      setImage(canvas.toDataURL("image/jpeg", 0.75));
    } catch { setError("We couldn't read that image. Try another file."); }
  }

  async function runOnce(e: React.FormEvent) {
    e.preventDefault();
    if (!model || busy) return;
    const found: typeof fe = {};
    if (mode === "image" && !prompt.trim()) found.prompt = "Describe the image you want.";
    if (mode !== "image" && !text.trim()) found.text = mode === "embedding" ? "Enter the text to embed." : "Enter the text to evaluate.";
    if (mode === "decision" && !question.trim()) found.question = "Enter a yes/no question.";
    setFe(found);
    if (Object.keys(found).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=\"true\"]")?.focus()); return; }
    setResult(null);
    const body = mode === "embedding" ? { kind: "embedding", model: model.slug, text, inputType }
      : mode === "image" ? { kind: "image", model: model.slug, prompt }
      : { kind: "decision", model: model.slug, input: text, question };
    const r = await run(body);
    if (r) setResult(r);
  }

  if (!model) return <Card className="p-8 text-center text-muted">No models are available.</Card>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="space-y-4 p-4">
        <Field label="Model" htmlFor="pg-model">
          <Select id="pg-model" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {models.map((m) => <option key={m.slug} value={m.slug}>{m.name} ({m.providerName})</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/70 p-3">
          <ProviderMark providerKey={model.providerKey} name={model.providerName} size="md" />
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{model.name}</p>
            <p className="truncate text-xs text-muted">{model.providerName} &bull; {formatTokens(model.contextTokens)} context</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary" className="rounded-full">{MODE_LABEL[mode]}</Badge>
          {model.isThinking && <Badge tone="info" className="rounded-full"><BrainCircuit className="size-3" aria-hidden />Thinking model</Badge>}
        </div>
        {model.isThinking && <p className="text-xs text-muted">This model reasons before it answers, so replies can take 30 seconds or more. Temperature and max tokens were set to suit it.</p>}

        {mode === "chat" && (
          <>
            <Field label="System prompt" htmlFor="pg-system" hint="Optional. Sets the model's role and tone.">
              <Textarea id="pg-system" rows={4} maxLength={4000} value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful assistant." />
            </Field>
            <Field label={`Temperature: ${temperature.toFixed(2)}`} htmlFor="pg-temp">
              <input id="pg-temp" type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-[rgb(var(--rn-primary))]" />
            </Field>
            {collections.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="size-4 text-lavender" aria-hidden />Knowledge base</legend>
                <p className="text-xs text-muted">Answer from these collections (RAG).</p>
                <ul className="max-h-36 space-y-1.5 overflow-auto pr-1">
                  {collections.map((c) => (
                    <li key={c.id}><Checkbox checked={kb.includes(c.id)} onChange={() => setKb((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} label={<span>{c.name} <span className="text-xs text-muted">({c.documents})</span></span>} /></li>
                  ))}
                </ul>
              </fieldset>
            )}
            {model.slug === "paligemma" && (
              <Field label="Image" htmlFor="pg-image" required hint="PaliGemma describes pictures. Attach one, then ask about it.">
                <input id="pg-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground" />
                {image && (
                  <span className="mt-2 flex items-center gap-3">
                    <img src={image} alt="Attached" className="size-16 rounded-lg border border-border object-cover" />
                    <Button variant="outline" size="sm" onClick={() => setImage(null)}>Remove</Button>
                  </span>
                )}
              </Field>
            )}
            <Field label="Max tokens" htmlFor="pg-max">
              <Select id="pg-max" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)}>{["256", "512", "1024", "2048", "4096"].map((v) => <option key={v} value={v}>{v}</option>)}</Select>
            </Field>
          </>
        )}
        {mode === "embedding" && (
          <Field label="Input type" htmlFor="pg-itype" hint="Use query for search text and passage for documents you index.">
            <Select id="pg-itype" value={inputType} onChange={(e) => setInputType(e.target.value as "query" | "passage")}><option value="query">query</option><option value="passage">passage</option></Select>
          </Field>
        )}
        {mode === "chat" && turns.length > 0 && <Button variant="outline" size="sm" onClick={() => { setTurns([]); setError(undefined); }}><Eraser className="size-3.5" aria-hidden />Clear conversation</Button>}
      </Card>

      <Card className="flex min-h-[520px] flex-col p-4">
        {mode === "chat" ? (
          <>
            <div className="min-h-[340px] flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-label="Conversation">
              {turns.length === 0 && !busy && (
                <div className="grid h-full min-h-[300px] place-items-center text-center text-muted"><div><Sparkles className="mx-auto mb-2 size-8 text-lavender" aria-hidden /><p className="text-sm">Send a message to start chatting with {model.name}.</p></div></div>
              )}
              {turns.map((t, i) => (
                <div key={i} className={cn("flex gap-2.5", t.role === "user" && "flex-row-reverse")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", t.role === "user" ? "btn-primary-bg text-white" : "bg-primary/25 text-lavender")} aria-hidden>{t.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</span>
                  <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", t.role === "user" ? "btn-primary-bg rounded-tr-sm text-white" : "rounded-tl-sm bg-surface-2 ring-1 ring-border")}>
                    <p className="whitespace-pre-wrap break-words">{t.content}</p>
                    {t.sources && <p className="mt-1.5 flex items-start gap-1 text-[11px] text-lavender"><BookOpen className="mt-px size-3 shrink-0" aria-hidden /><span>Sources: {t.sources.join(", ")}</span></p>}
                    {t.meta && <p className="mt-1 text-[11px] text-muted">{t.meta}</p>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{model.name} is thinking...</div>}
              <div ref={endRef} />
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-bad">{error}</p>}
            <form onSubmit={sendChat} className="mt-3 flex items-end gap-2">
              <Textarea aria-label="Message" rows={2} maxLength={8000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message..." className="min-h-[52px] flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <Button type="submit" disabled={busy || !draft.trim()} aria-label="Send message" className="size-11 px-0"><ArrowUp className="size-5" aria-hidden /></Button>
            </form>
          </>
        ) : (
          <form onSubmit={runOnce} className="flex flex-1 flex-col gap-4">
            {mode === "image" ? (
              <Field label="Prompt" htmlFor="pg-prompt" required error={fe.prompt}><Textarea id="pg-prompt" rows={4} maxLength={2000} value={prompt} onChange={(e) => { setPrompt(e.target.value); setFe((s) => ({ ...s, prompt: undefined })); }} placeholder="A robotic arm picks up a component on a workbench" /></Field>
            ) : (
              <Field label={mode === "embedding" ? "Text to embed" : "Text to evaluate"} htmlFor="pg-text" required error={fe.text}><Textarea id="pg-text" rows={5} maxLength={8000} value={text} onChange={(e) => { setText(e.target.value); setFe((s) => ({ ...s, text: undefined })); }} placeholder={mode === "embedding" ? "How do I connect a Telegram bot?" : "The package arrived with a broken screen."} /></Field>
            )}
            {mode === "decision" && <Field label="Yes/no question" htmlFor="pg-question" required error={fe.question}><Input id="pg-question" maxLength={500} value={question} onChange={(e) => { setQuestion(e.target.value); setFe((s) => ({ ...s, question: undefined })); }} placeholder="Does the customer report a damaged item?" /></Field>}
            <div><Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}{busy ? "Running..." : "Run"}</Button></div>
            {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-bad">{error}</p>}
            {result?.kind === "embedding" && (
              <div className="space-y-2 rounded-xl border border-border bg-surface-2/70 p-4 text-sm">
                <p><span className="font-semibold">{result.dimensions.toLocaleString("en-US")}</span> dimensions &bull; norm {result.norm.toFixed(3)} &bull; {(result.ms / 1000).toFixed(1)}s</p>
                <p className="break-all font-mono text-xs text-muted">[{result.preview.map((v) => v.toFixed(4)).join(", ")}, ...]</p>
              </div>
            )}
            {result?.kind === "image" && <ImageResult base64={result.imageBase64} prompt={prompt} name={model.name} seconds={result.ms / 1000} />}
            {result?.kind === "decision" && (
              <div className="space-y-2 rounded-xl border border-border bg-surface-2/70 p-4">
                <p className="text-sm">Probability of &ldquo;yes&rdquo;: <span className="text-lg font-extrabold">{(result.probability * 100).toFixed(1)}%</span></p>
                <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${(result.probability * 100).toFixed(0)} percent`}><div className="h-full rounded-full bg-gradient-to-r from-info to-primary" style={{ width: `${result.probability * 100}%` }} /></div>
              </div>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
