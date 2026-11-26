"use client";
/* The generated image is a base64 data URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Eraser,
  FastForward,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import * as React from "react";
import type { CitationSource, RetrievalMode } from "@backend/server/ai/citations";
import {
  executionMode,
  PLAYGROUND_TOKEN_OPTIONS,
  recommendedMaxTokens,
  supportsImageInput,
  type ModelDto,
} from "@backend/server/ai/model-catalog";
import type { SearchProviderChoice, SearchProviderDto, WebMediaPayload } from "@backend/server/ai/web-search-types";
import type { SessionUser } from "@backend/server/services/session";
import { CitedText, MessageLinkPreviews, SourcesPanel } from "@/components/ai/citations-panel";
import { CopyBubbleButton } from "@/components/ai/copy-bubble-button";
import { ImageResult } from "@/components/ai/image-result";
import { PromptTemplateModal } from "@/components/ai/prompt-template-picker";
import { ProviderMark } from "@/components/ai/provider-mark";
import { WebMediaPanel } from "@/components/ai/web-media-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { initialsOf } from "@/lib/initials";
import { formatTokens } from "@/lib/model-format";
import { PLAYGROUND_PROMPT_TEMPLATES, type SystemPromptTemplate } from "@/lib/prompt-templates";
import { cn } from "@/lib/utils";

interface Usage { promptTokens: number; completionTokens: number; totalTokens: number }
type RunResult =
  | { kind: "chat"; text: string; thinking?: string; thinkingMs?: number; usage: Usage; ms: number; sources?: CitationSource[]; retrieval?: RetrievalMode; webMedia?: WebMediaPayload; modelUsed?: string }
  | { kind: "embedding"; dimensions: number; preview: number[]; norm: number; usage: Usage; ms: number }
  | { kind: "image"; imageBase64: string; revisedPrompt?: string; modelUsed?: string; ms: number }
  | { kind: "decision"; probability: number; ms: number };

interface Turn {
  id: number;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingMs?: number;
  thinkingActive?: boolean;
  usedThinking?: boolean;
  skippedThinking?: boolean;
  image?: string;
  meta?: string;
  sources?: CitationSource[];
  retrieval?: RetrievalMode;
  webMedia?: WebMediaPayload;
  streaming?: boolean;
  providerKey?: string;
  providerName?: string;
  modelName?: string;
}

interface ActiveStreamMeta {
  botTurnId: number;
  prevTurns: Turn[];
  historyPayload: Turn[];
  userContent: string;
  attached?: string;
  startedAt: number;
  accThinking: string;
  model: ModelDto;
}

export interface PlaygroundCollection { id: string; name: string; documents: number }
export type PlaygroundUser = Pick<SessionUser, "name" | "initials" | "avatarUrl" | "demo">;

const MODE_LABEL = { chat: "Chat", embedding: "Embeddings", image: "Image generation", decision: "Decision" } as const;

const RETRIEVAL_META: Record<RetrievalMode, string> = {
  hybrid: "hybrid RAG",
  vector: "vector RAG",
  keyword: "keyword RAG",
  overview: "document RAG",
  agent: "agent knowledge",
  web: "open web search",
  none: "no KB match",
};

const QUICK_PLAYGROUND_TEMPLATE_IDS = [
  "pg-senior-engineer",
  "pg-research-analyst",
  "pg-copywriter",
  "pg-data-sql-analyst",
] as const;

export function Playground({
  models,
  initialSlug,
  collections = [],
  user,
  searchProviders = [],
}: {
  models: ModelDto[];
  initialSlug?: string;
  collections?: PlaygroundCollection[];
  user?: PlaygroundUser;
  searchProviders?: SearchProviderDto[];
}) {
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => { setAvatarFailed(false); }, [user?.avatarUrl, user?.demo]);
  const [kb, setKb] = React.useState<string[]>([]);
  const [image, setImage] = React.useState<string | null>(null);
  const [thinking, setThinking] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [searchProvider, setSearchProvider] = React.useState<SearchProviderChoice>("auto");
  const activeSearchProvider = searchProviders.find((p) => p.slug === searchProvider);
  // Default model comes directly from Supabase `public.ai_models` ordering (`sort_order`, `is_featured`).
  const [slug, setSlug] = React.useState(() => (models.some((m) => m.slug === initialSlug) ? initialSlug! : (models.find((m) => m.isFeatured && executionMode(m) === "chat") ?? models.find((m) => executionMode(m) === "chat") ?? models[0])?.slug ?? ""));
  const model = models.find((m) => m.slug === slug);
  const mode = model ? executionMode(model) : "chat";
  const canAttachImage = model ? supportsImageInput(model) : false;

  const [system, setSystem] = React.useState("");
  const [activeTemplateName, setActiveTemplateName] = React.useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = React.useState(false);
  const [temperature, setTemperature] = React.useState(model?.defaultTemperature ?? 0.5);
  const [maxTokens, setMaxTokens] = React.useState(() => String(model ? recommendedMaxTokens(model, false) : 2048));
  const [autoTokenScaled, setAutoTokenScaled] = React.useState(false);
  const savedFastMaxTokensRef = React.useRef<string>(String(model ? recommendedMaxTokens(model, false) : 2048));

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [activeCite, setActiveCite] = React.useState<Record<number, number | null>>({});
  const [openThinking, setOpenThinking] = React.useState<Record<number, boolean>>({});
  const [draft, setDraft] = React.useState("");
  const [text, setText] = React.useState("");
  const [inputType, setInputType] = React.useState<"query" | "passage">("query");
  const [prompt, setPrompt] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [fe, setFe] = React.useState<{ prompt?: string; text?: string; question?: string }>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [thinkingClock, setThinkingClock] = React.useState<number>(() => Date.now());

  const endRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const activeStreamRef = React.useRef<ActiveStreamMeta | null>(null);
  const skipTargetRef = React.useRef<number | null>(null);

  const hasActiveThinking = turns.some((t) => t.thinkingActive && t.streaming);

  React.useEffect(() => {
    if (!hasActiveThinking) return;
    setThinkingClock(Date.now());
    const id = window.setInterval(() => setThinkingClock(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [hasActiveThinking]);

  React.useEffect(() => () => { abortRef.current?.abort(); }, []);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);

  // Switching model starts a clean session and dynamically applies the model's defaults.
  React.useEffect(() => {
    abortRef.current?.abort();
    activeStreamRef.current = null;
    skipTargetRef.current = null;
    setTurns([]);
    setResult(null);
    setError(undefined);
    setImage(null);
    setThinking(false);
    setAutoTokenScaled(false);
    setActiveCite({});
    setOpenThinking({});
    setBusy(false);
    const m = models.find((x) => x.slug === slug);
    if (m) {
      setTemperature(m.defaultTemperature);
      const baseTokens = String(recommendedMaxTokens(m, false));
      savedFastMaxTokensRef.current = baseTokens;
      setMaxTokens(baseTokens);
    }
  }, [slug, models]);

  /** Dynamically scales Max tokens up for Deep Thinking and restores fast-mode tokens when turned off. */
  function handleThinkingToggle(on: boolean) {
    setThinking(on);
    if (!model) return;
    if (on) {
      savedFastMaxTokensRef.current = maxTokens;
      const optimal = recommendedMaxTokens(model, true);
      if (Number(maxTokens) < optimal) {
        setMaxTokens(String(optimal));
        setAutoTokenScaled(true);
      } else {
        setAutoTokenScaled(false);
      }
    } else {
      const restored = savedFastMaxTokensRef.current || String(recommendedMaxTokens(model, false));
      setMaxTokens(restored);
      setAutoTokenScaled(false);
    }
  }

  function applyPromptTemplate(tpl: SystemPromptTemplate) {
    setSystem(tpl.prompt);
    setActiveTemplateName(tpl.name);
    if (tpl.recommendedTemperature !== undefined) {
      setTemperature(tpl.recommendedTemperature);
    }
  }

  const quickTemplates = React.useMemo(
    () => QUICK_PLAYGROUND_TEMPLATE_IDS.map((id) => PLAYGROUND_PROMPT_TEMPLATES.find((t) => t.id === id)).filter((t): t is SystemPromptTemplate => Boolean(t)),
    [],
  );

  const tokenOptions = React.useMemo(() => {
    const cap = model?.maxOutputTokens && model.maxOutputTokens > 0
      ? Math.min(model.maxOutputTokens, 16384)
      : 16384;
    const set = new Set<number>(PLAYGROUND_TOKEN_OPTIONS.filter((v) => v <= cap));
    if (model?.defaultMaxTokens) set.add(Math.min(cap, model.defaultMaxTokens));
    const cur = Number(maxTokens);
    if (Number.isFinite(cur) && cur > 0) set.add(cur);
    return Array.from(set).sort((a, b) => a - b);
  }, [model, maxTokens]);

  async function run(body: Record<string, unknown>) {
    setBusy(true); setError(undefined);
    const r = await api<RunResult>("/api/v1/ai/run", { body });
    setBusy(false);
    if (!r.ok) { setError(r.message); return null; }
    return r.data;
  }

  async function executeChatStream(params: {
    activeModel: ModelDto;
    prevTurns: Turn[];
    historyPayload: Turn[];
    userContent: string;
    botTurnId: number;
    attached?: string;
    useThinking: boolean;
    overrideMaxTokens?: number;
    priorThinking?: string;
    skippedFromMs?: number;
  }) {
    const {
      activeModel,
      prevTurns,
      historyPayload,
      userContent,
      botTurnId,
      attached,
      useThinking,
      overrideMaxTokens,
      priorThinking,
      skippedFromMs,
    } = params;

    const ac = new AbortController();
    abortRef.current = ac;
    const startedAt = Date.now();
    activeStreamRef.current = {
      botTurnId,
      prevTurns,
      historyPayload,
      userContent,
      attached,
      startedAt,
      accThinking: priorThinking ?? "",
      model: activeModel,
    };

    const effectiveMaxTokens = overrideMaxTokens ?? (
      useThinking
        ? Math.max(Number(maxTokens) || 2048, recommendedMaxTokens(activeModel, true))
        : (Number(maxTokens) || activeModel.defaultMaxTokens || 2048)
    );

    const reqBody = {
      kind: "chat",
      model: activeModel.slug,
      system: system.trim() || undefined,
      messages: historyPayload.map(({ role, content: c }) => ({ role, content: c })),
      temperature,
      maxTokens: effectiveMaxTokens,
      thinking: useThinking,
      webSearch,
      ...(webSearch ? { searchProvider } : {}),
      stream: true,
      ...(kb.length ? { collectionIds: kb } : {}),
      ...(attached ? { image: attached } : {}),
    };

    const patchBot = (patch: Partial<Turn>) => {
      setTurns((prev) => prev.map((t) => (t.id === botTurnId ? { ...t, ...patch } : t)));
    };

    try {
      const res = await fetch("/api/v1/ai/run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(reqBody),
        signal: ac.signal,
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
        const modeTag = skippedFromMs ? "skipped thinking" : useThinking ? "deep thinking" : undefined;
        patchBot({
          content: r.text,
          thinking: r.thinking ?? priorThinking,
          thinkingMs: r.thinkingMs ?? skippedFromMs,
          thinkingActive: false,
          streaming: false,
          meta: `${(r.ms / 1000).toFixed(1)}s \u2022 ${r.usage.totalTokens || "?"} tokens${modeTag ? ` \u2022 ${modeTag}` : ""}${r.retrieval ? ` \u2022 ${RETRIEVAL_META[r.retrieval]}` : ""}`,
          sources: r.sources?.length ? r.sources : undefined,
          retrieval: r.retrieval,
          webMedia: r.webMedia,
        });
        setBusy(false);
        activeStreamRef.current = null;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let accThinking = priorThinking ?? "";
      let thinkingStartedAt: number | null = useThinking ? startedAt : null;
      let thinkingDurationMs: number | undefined = skippedFromMs;
      let currentEvent = "message";
      let streamSources: CitationSource[] | undefined;
      let streamRetrieval: RetrievalMode | undefined;
      let streamMedia: WebMediaPayload | undefined;
      let finished = false;

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
          if (line.startsWith(":")) continue; // SSE keepalive heartbeat comment
          if (line.startsWith("event:")) { currentEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) continue;
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>; } catch { continue; }

          if (currentEvent === "sources") {
            const s = (payload.sources as CitationSource[] | undefined) ?? [];
            streamRetrieval = payload.retrieval as RetrievalMode | undefined;
            streamSources = s.length ? s : undefined;
            patchBot({ sources: streamSources, retrieval: streamRetrieval });
          } else if (currentEvent === "media") {
            streamMedia = payload as unknown as WebMediaPayload;
            patchBot({ webMedia: streamMedia });
          } else if (currentEvent === "thinking") {
            const chunk = typeof payload.text === "string" ? payload.text : "";
            if (chunk) {
              if (thinkingStartedAt === null) thinkingStartedAt = Date.now();
              accThinking += chunk;
              if (activeStreamRef.current?.botTurnId === botTurnId) {
                activeStreamRef.current.accThinking = accThinking;
              }
              patchBot({ thinking: accThinking, thinkingActive: true, usedThinking: true, streaming: true });
            }
          } else if (currentEvent === "delta") {
            const chunk = typeof payload.text === "string" ? payload.text : "";
            if (chunk) {
              if (thinkingStartedAt !== null && thinkingDurationMs === undefined) {
                thinkingDurationMs = Math.max(100, Date.now() - thinkingStartedAt);
              }
              acc += chunk;
              patchBot({
                content: acc,
                thinkingActive: false,
                ...(thinkingDurationMs !== undefined ? { thinkingMs: thinkingDurationMs } : {}),
                streaming: true,
              });
            }
          } else if (currentEvent === "done") {
            finished = true;
            const finalText = typeof payload.text === "string" ? payload.text : acc;
            const finalThinking = typeof payload.thinking === "string" ? payload.thinking : (accThinking || undefined);
            const finalThinkingMs = typeof payload.thinkingMs === "number" ? payload.thinkingMs : thinkingDurationMs;
            const ms = Number(payload.ms ?? (Date.now() - startedAt));
            const usage = (payload.usage as Usage | undefined) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            const finalSources = (payload.sources as CitationSource[] | undefined) ?? streamSources;
            const finalRetrieval = (payload.retrieval as RetrievalMode | undefined) ?? streamRetrieval;
            const finalMedia = (payload.webMedia as WebMediaPayload | undefined) ?? streamMedia;
            const modeTag = skippedFromMs ? "skipped thinking" : useThinking ? "deep thinking" : undefined;
            patchBot({
              content: finalText,
              thinking: finalThinking,
              thinkingMs: finalThinkingMs,
              thinkingActive: false,
              streaming: false,
              sources: finalSources?.length ? finalSources : undefined,
              retrieval: finalRetrieval,
              webMedia: finalMedia,
              meta: `${(ms / 1000).toFixed(1)}s \u2022 ${usage.totalTokens || "?"} tokens${modeTag ? ` \u2022 ${modeTag}` : ""}${finalRetrieval ? ` \u2022 ${RETRIEVAL_META[finalRetrieval]}` : ""}`,
            });
          } else if (currentEvent === "error") {
            throw new Error(typeof payload.message === "string" ? payload.message : "The model returned an error.");
          }
        }
      }

      if (!finished) {
        if (skipTargetRef.current === botTurnId) return;
        if (!acc.trim()) throw new Error("The stream ended before an answer was received. Try again.");
        patchBot({ content: acc, thinkingActive: false, streaming: false });
      }
      if (abortRef.current === ac) abortRef.current = null;
      if (activeStreamRef.current?.botTurnId === botTurnId) activeStreamRef.current = null;
      setBusy(false);
    } catch (err) {
      // If user clicked "Skip thinking", suppress abort errors cleanly; skipThinking() owns the retry stream.
      if (skipTargetRef.current === botTurnId) {
        skipTargetRef.current = null;
        return;
      }
      if (ac.signal.aborted) {
        setBusy(false);
        return;
      }
      setBusy(false);
      activeStreamRef.current = null;
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
      setTurns(prevTurns);
      setDraft(userContent);
      if (attached) setImage(attached);
    }
  }

  /** Immediately cancels the active Deep Thinking pass and streams a fast, detailed direct answer instead. */
  async function skipThinking(turnId: number) {
    const active = activeStreamRef.current;
    if (!active || active.botTurnId !== turnId) return;
    const elapsedMs = Math.max(100, Date.now() - active.startedAt);
    const savedThinking = active.accThinking;
    skipTargetRef.current = turnId;
    abortRef.current?.abort();

    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId
          ? {
              ...t,
              thinking: savedThinking || undefined,
              thinkingMs: elapsedMs,
              thinkingActive: false,
              skippedThinking: true,
              streaming: true,
            }
          : t,
      ),
    );

    const fastTokens = Math.min(4096, Math.max(Number(savedFastMaxTokensRef.current) || 2048, 2048));
    await executeChatStream({
      activeModel: active.model,
      prevTurns: active.prevTurns,
      historyPayload: active.historyPayload,
      userContent: active.userContent,
      botTurnId: turnId,
      attached: active.attached,
      useThinking: false,
      overrideMaxTokens: fastTokens,
      priorThinking: savedThinking || undefined,
      skippedFromMs: elapsedMs,
    });
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || busy || !model) return;
    if (model.slug === "paligemma" && !image) return setError("Attach an image first. PaliGemma describes pictures.");

    const userTurnId = Date.now();
    const botTurnId = userTurnId + 1;
    const attached = image ?? undefined;
    const useThinking = Boolean(thinking && model.isThinking);
    const prevTurns = turns;
    const historyPayload: Turn[] = [...prevTurns, { id: userTurnId, role: "user", content, image: attached }];

    setTurns([
      ...historyPayload,
      {
        id: botTurnId,
        role: "assistant",
        content: "",
        streaming: true,
        usedThinking: useThinking,
        thinkingActive: useThinking,
        providerKey: model.providerKey,
        providerName: model.providerName,
        modelName: model.name,
      },
    ]);
    setDraft("");
    setImage(null);
    setBusy(true);
    setError(undefined);

    await executeChatStream({
      activeModel: model,
      prevTurns,
      historyPayload,
      userContent: content,
      botTurnId,
      attached,
      useThinking,
    });
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
          {mode === "chat" && webSearch && (
            <Badge tone="info" className="rounded-full">
              <Globe className="size-3" aria-hidden />
              Web search
            </Badge>
          )}
          {canAttachImage && <Badge tone="neutral" className="rounded-full">Vision</Badge>}
        </div>

        {mode === "chat" && (
          <>
            <div className="space-y-2.5 rounded-xl border border-border bg-surface-2/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <Globe className="size-3.5 text-lavender" aria-hidden />
                    Open Web Search
                  </p>
                  <p className="text-[11px] text-muted">
                    {webSearch ? "Live web articles, images, videos & citations." : "Search the open web with rich media & sources."}
                  </p>
                </div>
                <Switch label="Open Web Search" checked={webSearch} onCheckedChange={setWebSearch} />
              </div>
              {webSearch && searchProviders.length > 0 && (
                <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                  <label htmlFor="pg-search-provider" className="block text-[11px] font-semibold text-foreground/85">
                    Search provider
                  </label>
                  <Select
                    id="pg-search-provider"
                    value={searchProvider}
                    onChange={(e) => setSearchProvider(e.target.value as SearchProviderChoice)}
                    className="h-9 text-xs"
                  >
                    <option value="auto">Auto (Best configured provider)</option>
                    {searchProviders.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name} {p.configured ? "• Ready" : `• Add ${p.envKeyName ?? "key"}`}
                      </option>
                    ))}
                  </Select>
                  {activeSearchProvider ? (
                    <p className="text-[11px] leading-snug text-muted">
                      {activeSearchProvider.configured
                        ? activeSearchProvider.description
                        : `Set ${activeSearchProvider.envKeyName} in .env to enable ${activeSearchProvider.name} (falls back to Open Web automatically until set).`}
                    </p>
                  ) : (
                    <p className="text-[11px] leading-snug text-muted">
                      Checks TinyFish, SearXNG, Firecrawl, Jina, Tavily, Brave in DB priority order, with built-in zero-key Open Web fallback.
                    </p>
                  )}
                </div>
              )}
            </div>

            {model.isThinking && (
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-2/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold">
                      <BrainCircuit className="size-3.5 text-sky" aria-hidden />
                      Deep thinking
                    </p>
                    <p className="text-[11px] text-muted">
                      {thinking
                        ? "Focused reasoning + detailed answer. Skip anytime while thinking."
                        : "Off for instant sub-second replies."}
                    </p>
                  </div>
                  <Switch
                    label="Deep thinking"
                    checked={thinking}
                    onCheckedChange={handleThinkingToggle}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="pg-system" className="text-sm font-semibold">System prompt</label>
                <div className="flex items-center gap-1.5">
                  {system.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSystem(""); setActiveTemplateName(null); }}
                      className="text-[11px] font-semibold text-muted hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTemplateModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-lavender/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-lavender transition hover:border-lavender hover:bg-primary/25"
                  >
                    <LayoutTemplate className="size-3" aria-hidden />
                    Templates
                  </button>
                </div>
              </div>
              <Textarea
                id="pg-system"
                rows={3}
                maxLength={8000}
                value={system}
                onChange={(e) => { setSystem(e.target.value); setActiveTemplateName(null); }}
                placeholder="You are a helpful assistant."
              />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick system prompt templates">
                {quickTemplates.map((tpl) => {
                  const isCurrent = activeTemplateName === tpl.name && system === tpl.prompt;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyPromptTemplate(tpl)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition",
                        isCurrent
                          ? "border-lavender bg-primary/20 text-foreground"
                          : "border-border bg-surface-2/60 text-muted hover:border-lavender/50 hover:text-foreground",
                      )}
                      title={tpl.tagline}
                    >
                      {tpl.name.replace("Senior Software ", "").replace("Direct-Response ", "").replace("Deep ", "")}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setTemplateModalOpen(true)}
                  className="rounded-full border border-dashed border-lavender/45 px-2 py-0.5 text-[10.5px] font-semibold text-lavender hover:bg-primary/10"
                >
                  All {PLAYGROUND_PROMPT_TEMPLATES.length}...
                </button>
              </div>
              <p className="text-[11px] text-muted">
                {activeTemplateName
                  ? `Active template: ${activeTemplateName}. Edit freely.`
                  : "Optional. Sets the model's role, constraints, and output format."}
              </p>
            </div>

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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="pg-max" className="text-sm font-semibold">Max tokens</label>
                {thinking && model.isThinking && (
                  <Badge tone="info" className="rounded-full px-2 py-0 text-[10px]">
                    {autoTokenScaled ? "Auto-scaled" : "Deep Think budget"}
                  </Badge>
                )}
              </div>
              <Select
                id="pg-max"
                value={maxTokens}
                onChange={(e) => {
                  const next = e.target.value;
                  setMaxTokens(next);
                  setAutoTokenScaled(false);
                  if (!thinking) savedFastMaxTokensRef.current = next;
                }}
              >
                {tokenOptions.map((v) => (
                  <option key={v} value={String(v)}>
                    {v.toLocaleString("en-US")} tokens
                  </option>
                ))}
              </Select>
              {thinking && model.isThinking && (
                <p className="text-[11px] leading-snug text-muted">
                  Dynamically sized for both internal reasoning and a detailed final answer.
                </p>
              )}
            </div>
          </>
        )}
        {mode === "embedding" && (
          <Field label="Input type" htmlFor="pg-itype" hint="Use query for search text and passage for documents you index.">
            <Select id="pg-itype" value={inputType} onChange={(e) => setInputType(e.target.value as "query" | "passage")}><option value="query">query</option><option value="passage">passage</option></Select>
          </Field>
        )}
        {mode === "chat" && turns.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              abortRef.current?.abort();
              activeStreamRef.current = null;
              setBusy(false);
              setTurns([]);
              setActiveCite({});
              setOpenThinking({});
              setError(undefined);
            }}
          >
            <Eraser className="size-3.5" aria-hidden />Clear conversation
          </Button>
        )}
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
                      {webSearch
                        ? "Live Open Web Search active — replies include web sources, tables, images & videos."
                        : thinking && model.isThinking
                          ? `Deep Thinking active (${Number(maxTokens).toLocaleString("en-US")} max tokens) — focused reasoning with Skip option.`
                          : kb.length > 0
                            ? `Grounded in ${kb.length} selected knowledge ${kb.length === 1 ? "collection" : "collections"} with live citations.`
                            : "Responses stream token-by-token in real time."}
                    </p>
                  </div>
                </div>
              )}
              {turns.map((t) => {
                const activeIdx = activeCite[t.id] ?? null;
                const thinkOpen = Boolean(openThinking[t.id]);
                const userAvatarSrc = !avatarFailed
                  ? (user?.avatarUrl ?? (user?.demo ? "/images/illustrations/avatar.png" : null))
                  : null;
                const liveThinkSeconds = t.thinkingActive && activeStreamRef.current?.botTurnId === t.id
                  ? Math.max(0.1, (thinkingClock - activeStreamRef.current.startedAt) / 1000).toFixed(1)
                  : t.thinkingMs
                    ? (t.thinkingMs / 1000).toFixed(1)
                    : null;
                const showThinkingBar = t.role === "assistant" && (t.thinkingActive || t.skippedThinking || Boolean(t.thinking));
                const canSkip = t.role === "assistant" && Boolean(t.streaming && t.thinkingActive && !t.content);

                return (
                  <div key={t.id} className={cn("flex gap-2.5", t.role === "user" && "flex-row-reverse")}>
                    {t.role === "user" ? (
                      userAvatarSrc ? (
                        <img
                          src={userAvatarSrc}
                          alt={user?.name ? `${user.name} profile picture` : "Your profile picture"}
                          title={user?.name}
                          width={32}
                          height={32}
                          onError={() => setAvatarFailed(true)}
                          className="size-8 shrink-0 rounded-full object-cover ring-2 ring-primary/60"
                        />
                      ) : user ? (
                        <span
                          title={user.name}
                          aria-label={user.name}
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white ring-2 ring-primary/40"
                        >
                          {user.initials || initialsOf(user.name)}
                        </span>
                      ) : (
                        <span className="btn-primary-bg grid size-8 shrink-0 place-items-center rounded-full text-white" aria-hidden>
                          <User className="size-4" />
                        </span>
                      )
                    ) : (
                      <ProviderMark
                        providerKey={t.providerKey ?? model.providerKey}
                        name={t.providerName ?? model.providerName}
                        size="avatar"
                      />
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                        t.role === "user"
                          ? "btn-primary-bg rounded-tr-sm text-white"
                          : "rounded-tl-sm bg-surface-2 ring-1 ring-border",
                      )}
                    >
                      {t.image && <img src={t.image} alt="Attached image" className="mb-2 max-h-52 rounded-lg border border-white/15 object-contain" />}

                      {t.role === "user" ? (
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{t.content}</p>
                          <CopyBubbleButton text={t.content} tone="user" label="Copy query" />
                        </div>
                      ) : (
                        <>
                          {t.content && (
                            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
                              <span className="truncate text-[11px] font-semibold text-muted">
                                {t.modelName ?? model.name}
                              </span>
                              <CopyBubbleButton text={t.content} tone="assistant" label="Copy response" showLabel />
                            </div>
                          )}

                          {showThinkingBar && (
                            <div className="rn-think-box mb-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <button
                                  type="button"
                                  disabled={!t.thinking}
                                  onClick={() => setOpenThinking((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                                  className="inline-flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold text-foreground/90 disabled:cursor-default"
                                  aria-expanded={t.thinking ? thinkOpen : undefined}
                                >
                                  {t.thinkingActive ? (
                                    <BrainCircuit className="size-3.5 shrink-0 animate-pulse text-sky" aria-hidden />
                                  ) : (
                                    <BrainCircuit className="size-3.5 shrink-0 text-lavender" aria-hidden />
                                  )}
                                  <span className="truncate">
                                    {t.thinkingActive
                                      ? `Deep thinking...${liveThinkSeconds ? ` ${liveThinkSeconds}s` : ""}`
                                      : t.skippedThinking
                                        ? `Skipped thinking${liveThinkSeconds ? ` after ${liveThinkSeconds}s` : ""} · answering directly`
                                        : `Thought for ${liveThinkSeconds ?? "0.5"}s`}
                                  </span>
                                  {t.thinking && (
                                    thinkOpen
                                      ? <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
                                      : <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />
                                  )}
                                </button>
                                {canSkip && (
                                  <button
                                    type="button"
                                    onClick={() => void skipThinking(t.id)}
                                    className="rn-skip-think-btn"
                                  >
                                    <FastForward className="size-3 shrink-0" aria-hidden />
                                    Skip thinking
                                  </button>
                                )}
                              </div>
                              {t.thinking && thinkOpen && (
                                <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-surface/75 p-2.5 font-mono text-[11px] leading-relaxed text-muted">
                                  {t.thinking}
                                </pre>
                              )}
                            </div>
                          )}

                          {t.streaming && !t.content ? (
                            !t.thinkingActive && (
                              <span className="inline-flex items-center gap-2 text-xs text-muted">
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                {t.skippedThinking
                                  ? "Generating direct answer..."
                                  : webSearch
                                    ? "Searching open web, images & videos..."
                                    : kb.length > 0
                                      ? "Searching knowledge & generating..."
                                      : `${model.name} is replying...`}
                              </span>
                            )
                          ) : (
                            <CitedText
                              text={t.content}
                              sources={t.sources}
                              activeIndex={activeIdx}
                              onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [t.id]: prev[t.id] === idx ? null : idx }))}
                              variant="playground"
                              streaming={t.streaming}
                            />
                          )}

                          {!t.streaming && t.content && (
                            <MessageLinkPreviews text={t.content} sources={t.sources} webMedia={t.webMedia} variant="playground" />
                          )}
                          {t.webMedia && (t.webMedia.images.length > 0 || t.webMedia.videos.length > 0) && (
                            <WebMediaPanel media={t.webMedia} variant="playground" />
                          )}
                          {t.sources && t.sources.length > 0 && (
                            <SourcesPanel
                              text={t.content}
                              sources={t.sources}
                              retrieval={t.retrieval}
                              activeIndex={activeIdx}
                              onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [t.id]: idx }))}
                              variant="playground"
                            />
                          )}
                          {!t.streaming && (t.meta || t.content) && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/45 pt-1.5">
                              <p className="text-[11px] text-muted">{t.meta ?? ""}</p>
                              {t.content && <CopyBubbleButton text={t.content} tone="assistant" label="Copy response" showLabel />}
                            </div>
                          )}
                        </>
                      )}
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
              <Textarea aria-label="Message" rows={2} maxLength={8000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={webSearch ? "Search the open web for news, specs, guides, images & videos..." : kb.length > 0 ? "Ask about your knowledge base..." : "Type a message..."} className="min-h-[52px] flex-1"
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
            {result?.kind === "image" && (
              <ImageResult
                base64={result.imageBase64}
                prompt={prompt}
                revisedPrompt={result.revisedPrompt}
                name={model.name}
                seconds={result.ms / 1000}
              />
            )}
            {result?.kind === "decision" && (
              <div className="space-y-2 rounded-xl border border-border bg-surface-2/70 p-4">
                <p className="text-sm">Probability of &ldquo;yes&rdquo;: <span className="text-lg font-extrabold">{(result.probability * 100).toFixed(1)}%</span></p>
                <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${(result.probability * 100).toFixed(0)} percent`}><div className="h-full rounded-full bg-gradient-to-r from-info to-primary" style={{ width: `${result.probability * 100}%` }} /></div>
              </div>
            )}
          </form>
        )}
      </Card>

      <PromptTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        scope="playground"
        activePrompt={system}
        onApply={applyPromptTemplate}
      />
    </div>
  );
}
