import "server-only";
import { ApiError, Errors } from "@backend/lib/http/api";
import { logEvent } from "@backend/server/logger";
import { rateLimit } from "@backend/server/security/rate-limit";
import {
  getDbConfiguredFallback,
  getDbDefaultImageModel,
  getDbFallbackModels,
  getDbFastChatModel,
  getDbVisionModels,
  resolveModelFromDb,
  type DbRunnableModel,
} from "@backend/server/services/ai-models";
import type { ProviderRecord } from "./model-catalog";
import { recordUsage, type UsageKind } from "./usage";

export { rateLimit };

/** The fields of a catalog model that decide where and how a request is sent (hydrated from Supabase `ai_models`). */
export type RunnableModel = DbRunnableModel;

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

/** Fast interactive timeout: prevents hanging requests on free queues and stays within Cloudflare Workers limits. */
const TIMEOUT_MS = 25_000;
/** Deep-thinking timeout when the caller explicitly enables extended reasoning. */
const THINKING_TIMEOUT_MS = 60_000;
/** Image generation normally finishes in 2.5–8 s, though NVIDIA's free tier occasionally stalls a socket and succeeds immediately on retry. */
const IMAGE_ATTEMPT_MS = 15_000;
const IMAGE_ATTEMPTS = 3;
/** Minimum token budget when extended thinking is explicitly enabled. */
const THINKING_MIN_TOKENS = 2048;

/** Strips any leaked <think>...</think> reasoning tags from a model reply. */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Detects image MIME type and extension from raw base64 magic bytes. */
export function sniffImageMime(base64: string): { mime: string; ext: string } {
  if (base64.startsWith("iVBOR")) return { mime: "image/png", ext: "png" };
  if (base64.startsWith("UklGR")) return { mime: "image/webp", ext: "webp" };
  return { mime: "image/jpeg", ext: "jpg" };
}

/** Decodes a base64 string into a Uint8Array safely on both Cloudflare Workers and Node.js. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads the provider's API key using the `env_key_name` stored in Supabase `public.ai_providers`. */
function auth(provider: ProviderRecord, accept = "application/json") {
  const key = process.env[provider.envKeyName]?.trim();
  if (!key) {
    throw new ApiError(503, "PROVIDER_NOT_CONFIGURED", `This model needs ${provider.envKeyName} on the server. Add it to .env and restart.`);
  }
  return { authorization: `Bearer ${key}`, "content-type": "application/json", accept };
}

function mapHttpError(status: number): ApiError {
  if (status === 401 || status === 403) return new ApiError(502, "PROVIDER_AUTH", "The model provider rejected the server's API key.");
  if (status === 402) return new ApiError(502, "PROVIDER_CREDITS", "The model provider account is out of credits.");
  if (status === 410) return new ApiError(502, "PROVIDER_MODEL_EOL", "This model has been retired by the provider. Pick an active model from the catalog.");
  if (status === 404) return new ApiError(502, "PROVIDER_MODEL", "The provider does not offer this model right now.");
  if (status === 529 || status === 503) return new ApiError(503, "PROVIDER_BUSY", "This model is overloaded at the provider right now. Try again in a moment or pick another model.");
  if (status === 429) return new ApiError(429, "PROVIDER_RATE_LIMIT", "The model provider is rate limiting requests. Try again shortly.");
  if (status === 400 || status === 422) return Errors.invalid("The model provider rejected this request. Check the prompt and settings.");
  return Errors.upstream("The model provider returned an error.");
}

function isFallbackableError(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.code === "PROVIDER_TIMEOUT" ||
      e.code === "PROVIDER_BUSY" ||
      e.code === "PROVIDER_MODEL" ||
      e.code === "PROVIDER_MODEL_EOL" ||
      e.code === "PROVIDER_RATE_LIMIT" ||
      e.code === "UPSTREAM_ERROR")
  );
}

/** Retries only when an attempt stalls or the connection drops. Safe for idempotent calls such as image generation. */
async function postWithRetry(url: string, provider: ProviderRecord, body: unknown, attempts: number, attemptMs: number): Promise<Record<string, unknown>> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await post(url, provider, body, attemptMs);
    } catch (e) {
      last = e;
      const retryable = e instanceof ApiError && (e.code === "PROVIDER_TIMEOUT" || e.code === "PROVIDER_BUSY" || e.code === "UPSTREAM_ERROR");
      if (!retryable) throw e;
    }
  }
  throw last;
}

async function post(url: string, provider: ProviderRecord, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: auth(provider), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    if (timeout) throw new ApiError(502, "PROVIDER_TIMEOUT", "This model did not answer in time. Try again or choose a faster active model.");
    throw Errors.upstream("Could not reach the model provider.");
  }
  if (!res.ok) throw mapHttpError(res.status);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) throw Errors.upstream("The model provider returned an unreadable response.");
  return json;
}

const usageOf = (u: unknown): Usage => {
  const o = (u ?? {}) as Record<string, number | undefined>;
  const prompt = o.prompt_tokens ?? o.input_tokens ?? 0;
  const completion = o.completion_tokens ?? o.output_tokens ?? 0;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: o.total_tokens ?? prompt + completion, ...(typeof o.cost === "number" ? { costUsd: o.cost } : {}) };
};

/** Meters one successful call without blocking the caller's response latency. */
function meterNonBlocking(model: RunnableModel, kind: UsageKind, usage: Usage, startedAt: number, json?: Record<string, unknown>) {
  void recordUsage({
    slug: model.slug, source: model.source, apiModelId: model.apiModelId, kind,
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens,
    reportedCostUsd: usage.costUsd, latencyMs: Date.now() - startedAt, requestId: typeof json?.id === "string" ? json.id : undefined,
  }).catch(() => undefined);
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Enable extended hidden reasoning on thinking models. Defaults to false for fast sub-second responses. */
  thinking?: boolean;
  /** Override request timeout in ms (e.g. shorter on Telegram webhooks). */
  timeoutMs?: number;
  /** Fall back to another active DB model from the same provider on timeout, overload, or EOL. */
  allowFallback?: boolean;
}

function hasImagePart(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
}

function buildChatRequest(model: RunnableModel, provider: ProviderRecord, messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
  const deepThink = Boolean(opts.thinking && model.isThinking);
  const maxTokens = deepThink ? Math.max(opts.maxTokens ?? 2048, THINKING_MIN_TOKENS) : (opts.maxTokens ?? 2048);
  const body: Record<string, unknown> = {
    model: model.apiModelId,
    messages,
    temperature: opts.temperature ?? 0.5,
    max_tokens: maxTokens,
    stream,
  };
  if (stream) {
    body.stream_options = { include_usage: true };
  }
  // Providers flagged with `supports_thinking_toggle` in Supabase `ai_providers` accept enable_thinking: false for low-latency chat.
  if (provider.supportsThinkingToggle && !deepThink) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  const path = model.endpointPath || "/chat/completions";
  const url = `${provider.chatBaseUrl}${path}`;
  return { url, body, timeoutMs: opts.timeoutMs ?? (deepThink ? THINKING_TIMEOUT_MS : TIMEOUT_MS) };
}

async function chatOnce(model: RunnableModel, provider: ProviderRecord, messages: ChatMessage[], opts: ChatOptions): Promise<{ text: string; usage: Usage; modelUsed: string }> {
  const startedAt = Date.now();
  const { url, body, timeoutMs } = buildChatRequest(model, provider, messages, opts, false);
  const json = await post(url, provider, body, timeoutMs);
  const choice = (json.choices as { message?: { content?: unknown } }[] | undefined)?.[0];
  const message = choice?.message as { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } | undefined;
  const content = message?.content;
  const rawText = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : "";
  const text = stripThinkTags(rawText);
  if (!text) {
    if (message?.reasoning_content || message?.reasoning) {
      throw Errors.invalid("The model ran out of tokens while thinking. Turn off Deep Thinking or raise Max tokens and try again.");
    }
    throw Errors.upstream("The model returned an empty answer. Try again.");
  }
  const usage = usageOf(json.usage);
  meterNonBlocking(model, hasImagePart(messages) ? "vision" : "chat", usage, startedAt, json);
  return { text, usage, modelUsed: model.apiModelId };
}

/** OpenAI-compatible chat completion driven by Supabase `ai_providers` + `ai_models`, with fast mode and DB fallback. */
export async function chat(model: RunnableModel, messages: ChatMessage[], opts: ChatOptions = {}): Promise<{ text: string; usage: Usage; modelUsed?: string }> {
  const resolved = await resolveModelFromDb(model);
  const allowFallback = opts.allowFallback ?? resolved.provider.supportsThinkingToggle;
  try {
    return await chatOnce(resolved.model, resolved.provider, messages, opts);
  } catch (err) {
    if (!allowFallback || !isFallbackableError(err)) throw err;
    const fallbacks = await getDbFallbackModels({
      source: resolved.model.source,
      requireImage: hasImagePart(messages),
      excludeSlugs: [resolved.model.slug],
      limit: 3,
    });
    let lastErr: unknown = err;
    for (const fb of fallbacks) {
      try {
        const fbResolved = await resolveModelFromDb(fb);
        logEvent("llm", "warn", `Falling back from ${resolved.model.apiModelId} to ${fbResolved.model.apiModelId}: ${err instanceof Error ? err.message : "upstream error"}`);
        return await chatOnce(fbResolved.model, fbResolved.provider, messages, { ...opts, thinking: false, timeoutMs: Math.min(opts.timeoutMs ?? 15_000, 15_000) });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; usage: Usage; modelUsed: string };

async function openStream(model: RunnableModel, provider: ProviderRecord, messages: ChatMessage[], opts: ChatOptions): Promise<{ res: Response; effectiveModel: RunnableModel }> {
  const { url, body, timeoutMs } = buildChatRequest(model, provider, messages, opts, true);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: auth(provider, "text/event-stream"),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    if (timeout) throw new ApiError(502, "PROVIDER_TIMEOUT", "This model did not answer in time. Try again or pick a faster active model.");
    throw Errors.upstream("Could not reach the model provider.");
  }
  if (!res.ok) throw mapHttpError(res.status);
  if (!res.body) throw Errors.upstream("The model provider returned an empty stream.");
  return { res, effectiveModel: model };
}

/** Streams chat completion tokens incrementally over SSE so the Playground renders the first token in ~200-400ms. */
export async function* chatStream(model: RunnableModel, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<StreamEvent> {
  const startedAt = Date.now();
  const resolved = await resolveModelFromDb(model);
  const allowFallback = opts.allowFallback ?? resolved.provider.supportsThinkingToggle;
  let opened: { res: Response; effectiveModel: RunnableModel };

  try {
    opened = await openStream(resolved.model, resolved.provider, messages, opts);
  } catch (err) {
    if (!allowFallback || !isFallbackableError(err)) throw err;
    const fallbacks = await getDbFallbackModels({
      source: resolved.model.source,
      requireImage: hasImagePart(messages),
      excludeSlugs: [resolved.model.slug],
      limit: 1,
    });
    if (!fallbacks[0]) throw err;
    const fbResolved = await resolveModelFromDb(fallbacks[0]);
    logEvent("llm", "warn", `Stream falling back from ${resolved.model.apiModelId} to ${fbResolved.model.apiModelId}`);
    opened = await openStream(fbResolved.model, fbResolved.provider, messages, { ...opts, thinking: false, timeoutMs: 18_000 });
  }

  const reader = opened.res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullRaw = "";
  let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let sawReasoningOnly = false;
  let insideThink = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: Record<string, unknown>;
        try { json = JSON.parse(payload) as Record<string, unknown>; } catch { continue; }
        if (json.usage) usage = usageOf(json.usage);
        const delta = (json.choices as { delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }[] | undefined)?.[0]?.delta;
        if (!delta) continue;
        if (delta.reasoning_content || delta.reasoning) sawReasoningOnly = true;
        const piece = typeof delta.content === "string" ? delta.content : "";
        if (!piece) continue;
        fullRaw += piece;

        // Filter inline <think>...</think> blocks cleanly if a model emits them.
        let out = "";
        let cur = piece;
        while (cur.length > 0) {
          if (insideThink) {
            const end = cur.indexOf("</think>");
            if (end === -1) { cur = ""; break; }
            insideThink = false;
            cur = cur.slice(end + 8);
          } else {
            const start = cur.indexOf("<think>");
            if (start === -1) { out += cur; cur = ""; break; }
            out += cur.slice(0, start);
            insideThink = true;
            cur = cur.slice(start + 7);
          }
        }
        if (out) yield { type: "delta", text: out };
      }
    }
  } finally {
    reader.releaseLock();
  }

  const clean = stripThinkTags(fullRaw);
  if (!clean) {
    if (sawReasoningOnly) {
      throw Errors.invalid("The model ran out of tokens while thinking. Turn off Deep Thinking or raise Max tokens and try again.");
    }
    throw Errors.upstream("The model returned an empty answer. Try again.");
  }
  meterNonBlocking(opened.effectiveModel, hasImagePart(messages) ? "vision" : "chat", usage, startedAt);
  yield { type: "done", text: clean, usage, modelUsed: opened.effectiveModel.apiModelId };
}

/** Dense embeddings driven by Supabase `ai_providers` + `ai_models`. */
export async function embed(model: RunnableModel, input: string, inputType: "query" | "passage"): Promise<{ vector: number[]; usage: Usage }> {
  const startedAt = Date.now();
  const { model: m, provider } = await resolveModelFromDb(model);
  const path = m.endpointPath || "/embeddings";
  const json = await post(`${provider.chatBaseUrl}${path}`, provider, {
    model: m.apiModelId,
    input,
    encoding_format: "float",
    ...(m.source === "nvidia" ? { input_type: inputType, truncate: "END" } : {}),
  });
  const vector = (json.data as { embedding?: number[] }[] | undefined)?.[0]?.embedding;
  if (!vector?.length) throw Errors.upstream("The model returned no embedding.");
  const usage = usageOf(json.usage);
  meterNonBlocking(m, "embedding", usage, startedAt, json);
  return { vector, usage };
}

/** Embeds several texts in one request. The result keeps the order of `inputs`. */
export async function embedMany(model: RunnableModel, inputs: string[], inputType: "query" | "passage"): Promise<{ vectors: number[][]; usage: Usage }> {
  const startedAt = Date.now();
  const { model: m, provider } = await resolveModelFromDb(model);
  const path = m.endpointPath || "/embeddings";
  const json = await post(`${provider.chatBaseUrl}${path}`, provider, {
    model: m.apiModelId,
    input: inputs,
    encoding_format: "float",
    ...(m.source === "nvidia" ? { input_type: inputType, truncate: "END" } : {}),
  });
  const data = ((json.data as { embedding?: number[]; index?: number }[] | undefined) ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (data.length !== inputs.length || data.some((d) => !d.embedding?.length)) throw Errors.upstream("The model returned an incomplete set of embeddings.");
  const usage = usageOf(json.usage);
  meterNonBlocking(m, "embedding", usage, startedAt, json);
  return { vectors: data.map((d) => d.embedding as number[]), usage };
}

function extractImageArtifact(json: Record<string, unknown>): { base64: string | null; finishReason?: string } {
  const firstArtifact = (json.artifacts as { base64?: string; finishReason?: string }[] | undefined)?.[0];
  if (firstArtifact) {
    return {
      base64: typeof firstArtifact.base64 === "string" && firstArtifact.base64.length > 64 ? firstArtifact.base64 : null,
      finishReason: typeof firstArtifact.finishReason === "string" ? firstArtifact.finishReason : undefined,
    };
  }
  const b64Img = json.b64_image;
  if (typeof b64Img === "string" && b64Img.length > 64) return { base64: b64Img };
  const img = json.image;
  if (typeof img === "string" && img.length > 64) return { base64: img };
  const dataB64 = (json.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
  if (typeof dataB64 === "string" && dataB64.length > 64) return { base64: dataB64 };
  return { base64: null };
}

/**
 * NVIDIA FLUX returns HTTP 200 with finishReason="CONTENT_FILTERED" and a solid-black ~6.4 KB JPEG (~8.5k base64 chars)
 * when a prompt hits trademark or content filters. Never return a solid-black frame to the user.
 */
export function isFilteredOrBlankImage(json: Record<string, unknown>, base64: string | null): { blocked: boolean; reason?: string } {
  const finishReason = (json.artifacts as { finishReason?: string }[] | undefined)?.[0]?.finishReason;
  if (finishReason && finishReason.toUpperCase() !== "SUCCESS") {
    return { blocked: true, reason: finishReason };
  }
  if (!base64) return { blocked: true, reason: "EMPTY" };
  // A valid 768x768..1280x1024 JPEG from FLUX is typically 45 KB–350 KB; solid-black frames compress to ~6.4 KB (~8.6k base64 chars).
  if (base64.startsWith("/9j/") && base64.length < 14_000) {
    return { blocked: true, reason: "BLANK_FRAME" };
  }
  return { blocked: false };
}

/** Removes conversational wrapper phrases like "Generate iPhone Image" -> "iPhone" so diffusion models focus on the subject. */
export function cleanRawImagePrompt(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  const hadVerb = /^(?:please\s+)?(?:generate|create|make|draw|render|produce|show(?:\s+me)?|give\s+me)\s+/i.test(s);
  if (hadVerb) {
    s = s.replace(/^(?:please\s+)?(?:generate|create|make|draw|render|produce|show(?:\s+me)?|give\s+me)\s+/i, "");
    s = s.replace(/^(?:an?\s+)?(?:hd\s+|high[\s-]?(?:res|resolution|quality)\s+|detailed\s+|realistic\s+)?(?:image|picture|photo|photograph|illustration|artwork|drawing)\s+(?:of\s+)?/i, "");
    s = s.replace(/\s+(?:image|picture|photo|photograph)$/i, "");
  }
  return (s.trim() || raw.trim()).slice(0, 1800);
}

/** Picks FLUX-supported aspect ratio dimensions (valid NVIDIA NIM sizes: 768..1344 in steps of 64). */
export function pickImageDimensions(prompt: string): { width: number; height: number } {
  const p = prompt.toLowerCase();
  if (/\b(portrait|vertical|poster|phone wallpaper|9:16|story|reel|mobile wallpaper|headshot)\b/.test(p)) {
    return { width: 896, height: 1152 };
  }
  if (/\b(landscape|widescreen|wide shot|banner|desktop wallpaper|16:9|panorama|panoramic|cinematic wide|header)\b/.test(p)) {
    return { width: 1280, height: 768 };
  }
  return { width: 1024, height: 1024 };
}

/** Deterministic detailing suffix used when LLM prompt enrichment is skipped or unavailable. */
function fallbackEnhancedPrompt(subject: string): string {
  const words = subject.split(/\s+/).filter(Boolean).length;
  if (words >= 24) return subject;
  return `${subject}, intricate fine textures, balanced studio and natural lighting, crisp sharp focus, rich realistic color depth, thoughtful composition, ultra-detailed high-resolution photography`;
}

/**
 * Expands short or brand-named prompts into vivid, richly detailed visual prompts via the active fast DB chat model.
 * Describing visual geometry/materials instead of trademarked brand names prevents NVIDIA FLUX CONTENT_FILTERED black frames
 * while dramatically improving visual sharpness, lighting, and detail.
 */
async function enhanceImagePrompt(rawPrompt: string, strictVisualRewrite = false): Promise<string> {
  const cleaned = cleanRawImagePrompt(rawPrompt);
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  const looksShortOrGeneric = words < 20;
  // Common consumer trademarks that frequently trip NVIDIA FLUX's CONTENT_FILTERED black-frame guard.
  const hasBrandRisk = /\b(iphone|ipad|macbook|apple|airpods|samsung|galaxy|nike|adidas|gucci|rolex|ferrari|lamborghini|porsche|tesla|mercedes|bmw|coca[\s-]?cola|pepsi|starbucks|disney|marvel|pokemon|mario|lego|playstation|xbox|nintendo)\b/i.test(cleaned);

  if (!strictVisualRewrite && !looksShortOrGeneric && !hasBrandRisk) {
    return cleaned;
  }

  try {
    const fastModel = await getDbFastChatModel();
    if (!fastModel) return fallbackEnhancedPrompt(cleaned);
    const system = strictVisualRewrite
      ? "You are a professional photography art director. Rewrite the user's image request into one rich, vivid, 55–85 word visual scene description for a text-to-image model. CRITICAL: Do NOT include any brand names, trademarks, logos, or copyrighted character names — instead describe the exact physical design, materials, silhouette, colors, textures, studio/natural lighting, camera lens, depth of field, and atmosphere so the image looks breathtaking and unmistakable. Output ONLY the final prompt text, no quotes or commentary."
      : "You are a master visual prompt engineer for FLUX.1 image generation. Expand the user's request into one richly detailed, 45–80 word visual prompt with specific subject details, surface textures, lighting direction, environment/background, composition, color harmony, and sharp photographic or artistic quality. If the request mentions a trademarked consumer product or brand (like iPhone, Nike, Tesla, etc.), describe its signature physical design, materials, and form visually WITHOUT writing the trademarked word itself so the image safety filter never blocks it. Output ONLY the final prompt text, no quotes, labels, or markdown.";
    const r = await chat(
      fastModel,
      [
        { role: "system", content: system },
        { role: "user", content: `User image request: ${cleaned}` },
      ],
      { temperature: 0.45, maxTokens: 180, thinking: false, timeoutMs: 4_500, allowFallback: false },
    );
    const expanded = r.text.replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
    if (expanded.length >= 25 && expanded.length <= 1600) return expanded;
  } catch {
    // Fall back gracefully to deterministic high-detail styling if the fast model is busy.
  }
  return fallbackEnhancedPrompt(cleaned);
}

async function postFluxOnce(
  url: string,
  provider: ProviderRecord,
  prompt: string,
  dims: { width: number; height: number },
): Promise<{ json: Record<string, unknown>; base64: string | null; blocked: boolean; reason?: string }> {
  let lastErr: unknown;
  for (let i = 0; i < IMAGE_ATTEMPTS; i++) {
    // Keep full resolution on first two tries; only drop slightly to 896x896 on final retry after timeouts.
    const width = i < 2 ? dims.width : 896;
    const height = i < 2 ? dims.height : 896;
    try {
      const json = await post(url, provider, { prompt, width, height, steps: 4 }, IMAGE_ATTEMPT_MS);
      const { base64 } = extractImageArtifact(json);
      const check = isFilteredOrBlankImage(json, base64);
      return { json, base64, blocked: check.blocked, reason: check.reason };
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof ApiError && (e.code === "PROVIDER_TIMEOUT" || e.code === "PROVIDER_BUSY" || e.code === "UPSTREAM_ERROR");
      if (!retryable) throw e;
    }
  }
  throw lastErr;
}

async function callImageEndpoint(
  model: RunnableModel,
  provider: ProviderRecord,
  rawPrompt: string,
  startedAt: number,
): Promise<{ imageBase64: string; revisedPrompt?: string; modelUsed: string }> {
  const base = provider.mediaBaseUrl || provider.chatBaseUrl;
  const noTokens: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const isFlux = model.apiModelId.includes("flux") || (model.endpointPath ?? "").includes("/genai/");
  const path = model.endpointPath || (isFlux ? `/genai/${model.apiModelId}` : `/cosmos/${model.apiModelId}`);
  const url = `${base}${path}`;

  if (isFlux) {
    const dims = pickImageDimensions(rawPrompt);
    let activePrompt = await enhanceImagePrompt(rawPrompt, false);
    let attempt = await postFluxOnce(url, provider, activePrompt, dims);

    // If NVIDIA's safety/trademark filter still produced a CONTENT_FILTERED black frame, rewrite cleanly once and retry.
    if (attempt.blocked) {
      logEvent("llm", "warn", `Image generation blocked (${attempt.reason ?? "FILTERED"}) on ${model.apiModelId}; rewriting prompt for visual retry`);
      const rewritten = await enhanceImagePrompt(rawPrompt, true);
      if (rewritten !== activePrompt) {
        activePrompt = rewritten;
        attempt = await postFluxOnce(url, provider, activePrompt, dims);
      }
    }

    if (attempt.blocked || !attempt.base64) {
      throw new ApiError(
        422,
        "IMAGE_CONTENT_FILTERED",
        "The image model's safety filter blocked this prompt (trademarked brand names or restricted terms can trigger it). Try describing the object visually instead.",
      );
    }

    meterNonBlocking(model, "image", noTokens, startedAt);
    return {
      imageBase64: attempt.base64,
      revisedPrompt: activePrompt !== rawPrompt.trim() ? activePrompt : undefined,
      modelUsed: model.apiModelId,
    };
  }

  const json = await postWithRetry(url, provider, { model_mode: "text2image", prompt: rawPrompt, resolution: "480_1_1", num_frames: 1 }, 1, IMAGE_ATTEMPT_MS);
  const { base64 } = extractImageArtifact(json);
  const check = isFilteredOrBlankImage(json, base64);
  if (check.blocked || !base64) {
    throw new ApiError(422, "IMAGE_CONTENT_FILTERED", "The image model could not generate this prompt. Try describing the scene in visual detail.");
  }
  meterNonBlocking(model, "image", noTokens, startedAt);
  return { imageBase64: base64, modelUsed: model.apiModelId };
}

/**
 * Text-to-image driven by Supabase `ai_providers` + `ai_models`.
 * Follows the DB-configured `fallback_model_slug` (or the top active DB image model) if the selected model returns 404/410/503,
 * enhances short prompts for high visual detailing, and guards against CONTENT_FILTERED black frames.
 */
export async function generateImage(
  model: RunnableModel,
  prompt: string,
): Promise<{ imageBase64: string; revisedPrompt?: string; modelUsed?: string }> {
  const startedAt = Date.now();
  const cleanPrompt = prompt.trim().slice(0, 2000);
  if (!cleanPrompt) throw Errors.invalid("Describe the image you want to generate.");

  const { model: resolved, provider } = await resolveModelFromDb(model);
  if (!provider.mediaBaseUrl && resolved.source !== "nvidia") {
    throw Errors.invalid("Image generation is not available for this model.");
  }

  try {
    return await callImageEndpoint(resolved, provider, cleanPrompt, startedAt);
  } catch (e) {
    if (!isFallbackableError(e)) throw e;
    const dbFallback = (await getDbConfiguredFallback(resolved.slug)) ?? (await getDbDefaultImageModel(resolved.slug));
    if (!dbFallback || dbFallback.slug === resolved.slug) throw e;
    const fb = await resolveModelFromDb(dbFallback);
    logEvent("llm", "warn", `${resolved.apiModelId} unavailable for image gen (${e instanceof ApiError ? e.code : "error"}), routing via DB fallback ${fb.model.apiModelId}`);
    return callImageEndpoint(fb.model, fb.provider, cleanPrompt, startedAt);
  }
}

/** Yes/no question about a text, answered by a Decisions API model configured in Supabase `ai_providers` + `ai_models`. */
export async function decide(model: RunnableModel, input: string, question: string): Promise<{ probability: number }> {
  const startedAt = Date.now();
  const { model: m, provider } = await resolveModelFromDb(model);
  const path = m.endpointPath || "/decisions";
  const json = await post(`${provider.chatBaseUrl}${path}`, provider, {
    model: m.apiModelId,
    input,
    questions: [{ type: "predicate", name: "answer", instructions: question }],
  });
  const answer = (json.answers as { type?: string; probability?: number }[] | undefined)?.[0];
  if (answer?.type === "refusal") throw Errors.invalid("The model declined to answer this question.");
  if (typeof answer?.probability !== "number") throw Errors.upstream("The model returned no answer.");
  meterNonBlocking(m, "decision", usageOf(json.usage), startedAt, json);
  return { probability: answer.probability };
}

/**
 * High-accuracy multimodal vision analysis using active multimodal models ordered by `sort_order`
 * from Supabase `public.ai_models`.
 */
export async function analyzeImage(
  prompt: string,
  imageDataUrl: string,
  opts: { system?: string; maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<{ text: string; usage: Usage; modelUsed?: string }> {
  if (!imageDataUrl) throw Errors.invalid("Attach an image first and try again.");
  const visionModels = await getDbVisionModels();
  if (!visionModels.length) throw Errors.upstream("No active vision model is configured in the model catalog.");
  const systemPrompt =
    opts.system?.trim() ||
    "You are a precise, thorough visual analyst. Examine the image carefully, read all visible text, numbers, labels, ticker symbols, dates, and chart trends accurately, and provide a well-structured, detailed analysis (using bold headings, bullet points, and Markdown tables when summarizing structured metrics). Never reply with 'unanswerable' or vague generic descriptions.";
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: prompt.trim() || "Describe and analyze this image in detail." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];
  return chat(visionModels[0]!, messages, {
    temperature: opts.temperature ?? 0.25,
    maxTokens: opts.maxTokens ?? 1536,
    thinking: false,
    timeoutMs: opts.timeoutMs ?? 20_000,
    allowFallback: true,
  });
}

/** Vision captioning / VQA helper. Routes legacy caption-only models via their DB-configured multimodal fallback. */
export async function vlmText(model: RunnableModel, prompt: string, maxTokens: number, imageDataUrl?: string): Promise<{ text: string; usage: Usage }> {
  if (!imageDataUrl) throw Errors.invalid("This model describes images. Attach a picture and try again.");
  const dbFallback = await getDbConfiguredFallback(model.slug);
  if (model.slug === "paligemma" && dbFallback) {
    return analyzeImage(prompt, imageDataUrl, { maxTokens: Math.max(maxTokens, 768) });
  }
  return chat(model, [
    {
      role: "user",
      content: [
        { type: "text", text: prompt.trim() || "Describe this image in detail." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ], { maxTokens, temperature: 0.3, thinking: false });
}
