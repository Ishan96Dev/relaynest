"use client";
/* The generated image is a base64 data URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import { ArrowUp, BookOpen, Bot, BrainCircuit, Eraser, ImagePlus, Loader2, Sparkles, User, Zap } from "lucide-react";
import * as React from "react";
import type { CitationSource, RetrievalMode } from "@backend/server/ai/citations";
import { executionMode, supportsImageInput, type ModelDto } from "@backend/server/ai/model-catalog";
import { CitedText, SourcesPanel } from "@/components/ai/citations-panel";
import { ImageResult } from "@/components/ai/image-result";
import { ProviderMark } from "@/components/ai/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { formatTokens } from "@/lib/model-format";
import { cn } from "@/lib/utils";

interface Usage { promptTokens: number; completionTokens: number; totalTokens: number }
type RunResult =
  | { kind: "chat"; text: string; usage: Usage; ms: number; sources?: CitationSource[]; retrieval?: RetrievalMode; modelUsed?: string }
  | { kind: "embedding"; dimensions: number; preview: number[]; norm: number; usage: Usage; ms: number }
  | { kind: "image"; imageBase64: string; ms: number }
  | { kind: "decision"; probability: number; ms: number };

interface Turn {
  id: number;
  role: "user" | "assistant";
  content: string;
  image?: string;
  meta?: string;
  sources?: CitationSource[];
  retrieval?: RetrievalMode;
  streaming?: boolean;
}
export interface PlaygroundCollection { id: string; name: string; documents: number }

const MODE_LABEL = { chat: "Chat", embedding: "Embeddings", image: "Image generation", decision: "Decision" } as const;

const RETRIEVAL_META: Record<RetrievalMode, string> = {
  hybrid: "hybrid RAG",
  vector: "vector RAG",
  keyword: "keyword RAG",
  overview: "document RAG",
  agent: "agent knowledge",
  none: "no KB match",
};

export function Playground({ models, initialSlug, collections = [] }: { models: ModelDto[]; initialSlug?: string; collections?: PlaygroundCollection[] }) {
  const [kb, setKb] = React.useState<string[]>([]);
  const [image, setImage] = React.useState<string | null>(null);
  const [thinking, setThinking] = React.useState(false);
  // Default model comes directly from Supabase `public.ai_models` ordering (`sort_order`, `is_featured`).
  const [slug, setSlug] = React.useState(() => (models.some((m) => m.slug === initialSlug) ? initialSlug! : (models.find((m) => m.isFeatured && executionMode(m) === "chat") ?? models.find((m) => executionMode(m) === "chat") ?? models[0])?.slug ?? ""));
  const model = models.find((m) => m.slug === slug);
  const mode = model ? executionMode(model) : "chat";
  const canAttachImage = model ? supportsImageInput(model) : false;

  const [system, setSystem] = React.useState("");
  const [temperature, setTemperature] = React.useState(model?.defaultTemperature ?? 0.5);
  const [maxTokens, setMaxTokens] = React.useState(String(model?.defaultMaxTokens ?? 1024));
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [activeCite, setActiveCite] = React.useState<Record<number, number | null>>({});
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
    setTurns([]); setResult(null); setError(undefined); setImage(null); setThinking(false); setActiveCite({});
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

    const userTurnId = Date.now();
    const botTurnId = userTurnId + 1;
    const attached = image ?? undefined;
    const historyPayload = [...turns, { id: userTurnId, role: "user" as const, content, image: attached }];
    setTurns([
      ...historyPayload,
      { id: botTurnId, role: "assistant", content: "", streaming: true },
    ]);
    setDraft("");
    setImage(null);
    setBusy(true);
    setError(undefined);

    const reqBody = {
      kind: "chat",
      model: model.slug,
      system: system.trim() || undefined,
      messages: historyPayload.map(({ role, content: c }) => ({ role, content: c })),
      temperature,
      maxTokens: Number(maxTokens),
      thinking,
      stream: true,
      ...(kb.length ? { collectionIds: kb } : {}),
      ...(attached ? { image: attached } : {}),
    };

    try {
      const res = await fetch("/api/v1/ai/run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(reqBody),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Request failed.");
      }

      // Fallback if proxy/route returned plain JSON instead of SSE stream.
      if (!contentType.includes("text/event-stream") || !res.body) {
        const j = await res.json();
        const r = j.data as Extract<RunResult, { kind: "chat" }>;
        setTurns([
          ...historyPayload,
          {
            id: botTurnId,
            role: "assistant",
            content: r.text,
            meta: `${(r.ms / 1000).toFixed(1)}s \u2022 ${r.usage.totalTokens || "?"} tokens${r.retrieval ? ` \u2022 ${RETRIEVAL_META[r.retrieval]}` : ""}`,
            sources: r.sources?.length ? r.sources : undefined,
            retrieval: r.retrieval,
          },
        ]);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let currentEvent = "message";
      let streamSources: CitationSource[] | undefined;
      let streamRetrieval: RetrievalMode | undefined;
      let finished = false;

      const patchBot = (patch: Partial<Turn>) => {
        setTurns((prev) => prev.map((t) => (t.id === botTurnId ? { ...t, ...patch } : t)));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf("\n");
        while (nl !== -1) {
          const line = buf.slice(0, nl).trimEnd();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf("\n");
          if (!line) { currentEvent = "message"; continue; }
          if (line.startsWith("event:")) { currentEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) continue;
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>; } catch { continue; }

          if (currentEvent === "sources") {
            const s = (payload.sources as CitationSource[] | undefined) ?? [];
            streamRetrieval = payload.retrieval as RetrievalMode | undefined;
            streamSources = s.length ? s : undefined;
            patchBot({ sources: streamSources, retrieval: streamRetrieval });
          } else if (currentEvent === "delta") {
            const chunk = typeof payload.text === "string" ? payload.text : "";
            if (chunk) {
              acc += chunk;
              patchBot({ content: acc, streaming: true });
            }
          } else if (currentEvent === "done") {
            finished = true;
            const finalText = typeof payload.text === "string" ? payload.text : acc;
            const ms = Number(payload.ms ?? 0);
            const usage = (payload.usage as Usage | undefined) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            const finalSources = (payload.sources as CitationSource[] | undefined) ?? streamSources;
            const finalRetrieval = (payload.retrieval as RetrievalMode | undefined) ?? streamRetrieval;
            patchBot({
              content: finalText,
              streaming: false,
              sources: finalSources?.length ? finalSources : undefined,
              retrieval: finalRetrieval,
              meta: `${(ms / 1000).toFixed(1)}s \u2022 ${usage.totalTokens || "?"} tokens${finalRetrieval ? ` \u2022 ${RETRIEVAL_META[finalRetrieval]}` : ""}`,
            });
          } else if (currentEvent === "error") {
            throw new Error(typeof payload.message === "string" ? payload.message : "The model returned an error.");
          }
        }
      }

      if (!finished) {
        if (!acc.trim()) throw new Error("The stream ended before an answer was received. Try again.");
        patchBot({ content: acc, streaming: false });
      }
      setBusy(false);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
      setTurns(turns);
      setDraft(content);
      if (attached) setImage(attached);
    }
  }

  /** Resizes an attached image crisply (up to 1024px JPEG for high-accuracy OCR & charts). */
  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    if (!file.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG or WebP).");
    try {
      const bmp = await createImageBitmap(file);
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      setImage(canvas.toDataURL("image/jpeg", 0.85));
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
          {mode === "chat" && (
            <Badge tone={thinking ? "info" : "success"} className="rounded-full">
              {thinking ? <BrainCircuit className="size-3" aria-hidden /> : <Zap className="size-3" aria-hidden />}
              {thinking ? "Deep thinking" : "Fast streaming"}
            </Badge>
          )}
          {canAttachImage && <Badge tone="neutral" className="rounded-full">Vision</Badge>}
        </div>

        {mode === "chat" && (
          <>
            {model.isThinking && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold">Deep thinking</p>
                  <p className="text-[11px] text-muted">{thinking ? "Slower extended reasoning pass." : "Off for instant sub-second replies."}</p>
                </div>
                <Switch
                  label="Deep thinking"
                  checked={thinking}
                  onCheckedChange={(on) => {
                    setThinking(on);
                    if (on && Number(maxTokens) < 2048) setMaxTokens("2048");
                  }}
                />
              </div>
            )}
            <Field label="System prompt" htmlFor="pg-system" hint="Optional. Sets the model's role and tone.">
              <Textarea id="pg-system" rows={3} maxLength={4000} value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful assistant." />
            </Field>
            <Field label={`Temperature: ${temperature.toFixed(2)}`} htmlFor="pg-temp">
              <input id="pg-temp" type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-[rgb(var(--rn-primary))]" />
            </Field>
            {collections.length > 0 && (
              <fieldset className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3">
                <legend className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="size-4 text-lavender" aria-hidden />Knowledge base</legend>
                <p className="text-xs text-muted">Ground replies in these collections with inline citations &amp; sources.</p>
                <ul className="max-h-36 space-y-1.5 overflow-auto pr-1">
                  {collections.map((c) => (
                    <li key={c.id}><Checkbox checked={kb.includes(c.id)} onChange={() => setKb((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} label={<span>{c.name} <span className="text-xs text-muted">({c.documents})</span></span>} /></li>
                  ))}
                </ul>
              </fieldset>
            )}
            {canAttachImage && (
              <Field
                label="Attach image"
                htmlFor="pg-image"
                required={model.slug === "paligemma"}
                hint={model.slug === "paligemma" ? "Attach an image, then ask about it." : "Optional. Attach a screenshot, chart or photo to analyze."}
              >
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
              <Select id="pg-max" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)}>{["256", "512", "1024", "1536", "2048", "4096"].map((v) => <option key={v} value={v}>{v}</option>)}</Select>
            </Field>
          </>
        )}
        {mode === "embedding" && (
          <Field label="Input type" htmlFor="pg-itype" hint="Use query for search text and passage for documents you index.">
            <Select id="pg-itype" value={inputType} onChange={(e) => setInputType(e.target.value as "query" | "passage")}><option value="query">query</option><option value="passage">passage</option></Select>
          </Field>
        )}
        {mode === "chat" && turns.length > 0 && <Button variant="outline" size="sm" onClick={() => { setTurns([]); setActiveCite({}); setError(undefined); }}><Eraser className="size-3.5" aria-hidden />Clear conversation</Button>}
      </Card>

      <Card className="flex min-h-[540px] flex-col p-4">
        {mode === "chat" ? (
          <>
            <div className="min-h-[360px] flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-label="Conversation">
              {turns.length === 0 && !busy && (
                <div className="grid h-full min-h-[320px] place-items-center text-center text-muted">
                  <div>
                    <Sparkles className="mx-auto mb-2 size-8 text-lavender" aria-hidden />
                    <p className="text-sm font-medium text-foreground/85">Send a message to start chatting with {model.name}.</p>
                    <p className="mt-1 text-xs text-muted">
                      {kb.length > 0 ? `Grounded in ${kb.length} selected knowledge ${kb.length === 1 ? "collection" : "collections"} with live citations.` : "Responses stream token-by-token in real time."}
                    </p>
                  </div>
                </div>
              )}
              {turns.map((t) => {
                const activeIdx = activeCite[t.id] ?? null;
                return (
                  <div key={t.id} className={cn("flex gap-2.5", t.role === "user" && "flex-row-reverse")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", t.role === "user" ? "btn-primary-bg text-white" : "bg-primary/25 text-lavender")} aria-hidden>{t.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</span>
                    <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", t.role === "user" ? "btn-primary-bg rounded-tr-sm text-white" : "rounded-tl-sm bg-surface-2 ring-1 ring-border")}>
                      {t.image && <img src={t.image} alt="Attached image" className="mb-2 max-h-52 rounded-lg border border-white/15 object-contain" />}
                      {t.role === "assistant" && t.streaming && !t.content ? (
                        <span className="inline-flex items-center gap-2 text-xs text-muted">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          {kb.length > 0 ? "Searching knowledge & generating..." : `${model.name} is replying...`}
                        </span>
                      ) : t.role === "assistant" ? (
                        <CitedText
                          text={t.content}
                          sources={t.sources}
                          activeIndex={activeIdx}
                          onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [t.id]: prev[t.id] === idx ? null : idx }))}
                          variant="playground"
                          streaming={t.streaming}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{t.content}</p>
                      )}
                      {t.role === "assistant" && t.sources && t.sources.length > 0 && (
                        <SourcesPanel
                          text={t.content}
                          sources={t.sources}
                          retrieval={t.retrieval}
                          activeIndex={activeIdx}
                          onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [t.id]: idx }))}
                          variant="playground"
                        />
                      )}
                      {t.meta && <p className="mt-1.5 text-[11px] text-muted">{t.meta}</p>}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-bad">{error}</p>}
            {image && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2/70 px-2.5 py-1.5 text-xs">
                <ImagePlus className="size-4 text-lavender" aria-hidden />
                <span className="flex-1 truncate text-foreground/85">Image ready to send with your next message</span>
                <button type="button" className="font-semibold text-bad hover:underline" onClick={() => setImage(null)}>Remove</button>
              </div>
            )}
            <form onSubmit={sendChat} className="mt-3 flex items-end gap-2">
              <Textarea aria-label="Message" rows={2} maxLength={8000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={kb.length > 0 ? "Ask about your knowledge base..." : "Type a message..."} className="min-h-[52px] flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <Button type="submit" disabled={busy || !draft.trim()} aria-label="Send message" className="size-11 px-0"><ArrowUp className="size-5" aria-hidden /></Button>
            </form>
          </>
        ) : (
          <form onSubmit={runOnce} className="flex flex-1 flex-col gap-4">
            {mode === "image" ? (
              <Field label="Prompt" htmlFor="pg-prompt" required error={fe.prompt}><Textarea id="pg-prompt" rows={4} maxLength={2000} value={prompt} onChange={(e) => { setPrompt(e.target.value); setFe((s) => ({ ...s, prompt: undefined })); }} placeholder="A futuristic neon city reflected in calm rain puddles at night, photorealistic" /></Field>
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
