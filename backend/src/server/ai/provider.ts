import "server-only";
import { aiKeys } from "@backend/lib/env/ai";
import { ApiError, Errors } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/security/rate-limit";
import type { ModelSource } from "./model-catalog";
import { recordUsage, type UsageKind } from "./usage";

export { rateLimit };

/** The fields of a catalog model that decide where and how a request is sent. */
export interface RunnableModel {
  slug: string;
  source: ModelSource;
  apiModelId: string;
  /** Reasoning model: needs a larger token budget and more time. */
  isThinking?: boolean;
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface Usage { promptTokens: number; completionTokens: number; totalTokens: number; costUsd?: number }

const NVIDIA_CHAT = "https://integrate.api.nvidia.com/v1";
const NVIDIA_AI = "https://ai.api.nvidia.com/v1";
const GATEWAY = "https://ai-gateway.vercel.sh/v1";
/** Free NVIDIA endpoints queue under load; waiting longer than this rarely helps, so fail with a clear message. */
const TIMEOUT_MS = 45_000;
/** Thinking models reason for a while before the first word; 30 s or more is normal for them. */
const THINKING_TIMEOUT_MS = 120_000;
/**
 * Image models normally answer in 3-10 s, but the free tier sometimes accepts a request and never answers it
 * (seen with FLUX: the same call hangs once, then succeeds in 5 s). So each attempt is short and a stalled one is retried.
 */
const IMAGE_ATTEMPT_MS = 25_000;
const IMAGE_ATTEMPTS = 3;
/** Below this, a thinking model often spends the whole budget reasoning and returns no answer. */
const THINKING_MIN_TOKENS = 2048;

function auth(source: ModelSource) {
  const keys = aiKeys();
  const key = source === "nvidia" ? keys.nvidia : keys.gateway;
  if (!key) {
    const name = source === "nvidia" ? "NVIDIA_API_KEY" : "AI_GATEWAY_API_KEY";
    throw new ApiError(503, "PROVIDER_NOT_CONFIGURED", `This model needs ${name} on the server. Add it to .env and restart.`);
  }
  return { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" };
}

/** Calls an upstream API. Provider error text is never forwarded verbatim, so a key or prompt cannot leak through it. */
/** Retries only when an attempt stalls or the connection drops. Safe for idempotent calls such as image generation. */
async function postWithRetry(url: string, source: ModelSource, body: unknown, attempts: number, attemptMs: number): Promise<Record<string, unknown>> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await post(url, source, body, attemptMs);
    } catch (e) {
      last = e;
      const retryable = e instanceof ApiError && (e.code === "PROVIDER_TIMEOUT" || e.code === "UPSTREAM_ERROR");
      if (!retryable) throw e;
    }
  }
  throw last;
}

async function post(url: string, source: ModelSource, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: auth(source), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const timeout = e instanceof Error && e.name === "TimeoutError";
    if (timeout) throw new ApiError(502, "PROVIDER_TIMEOUT", "This model did not answer in time. The provider is probably busy with a queue. Try again, or pick another model (Nemotron models are usually fast).");
    throw Errors.upstream("Could not reach the model provider.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ApiError(502, "PROVIDER_AUTH", "The model provider rejected the server's API key.");
    if (res.status === 402) throw new ApiError(502, "PROVIDER_CREDITS", "The model provider account is out of credits.");
    if (res.status === 404) throw new ApiError(502, "PROVIDER_MODEL", "The provider does not offer this model right now.");
    if (res.status === 529 || res.status === 503) throw new ApiError(503, "PROVIDER_BUSY", "This model is overloaded at the provider right now. Try again in a minute or pick another model.");
    if (res.status === 429) throw new ApiError(429, "PROVIDER_RATE_LIMIT", "The model provider is rate limiting requests. Try again shortly.");
    if (res.status === 400 || res.status === 422) throw Errors.invalid("The model provider rejected this request. Check the prompt and settings.");
    throw Errors.upstream("The model provider returned an error.");
  }
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

/** Meters one successful call (tokens, cost, latency) against the workspace set by withUsageScope. */
async function meter(model: RunnableModel, kind: UsageKind, usage: Usage, startedAt: number, json?: Record<string, unknown>) {
  await recordUsage({
    slug: model.slug, source: model.source, apiModelId: model.apiModelId, kind,
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens,
    reportedCostUsd: usage.costUsd, latencyMs: Date.now() - startedAt, requestId: typeof json?.id === "string" ? json.id : undefined,
  });
}
export interface ChatOptions { temperature?: number; maxTokens?: number }

/** OpenAI-compatible chat completion on NVIDIA Build or Vercel AI Gateway. */
export async function chat(model: RunnableModel, messages: ChatMessage[], opts: ChatOptions = {}): Promise<{ text: string; usage: Usage }> {
  const startedAt = Date.now();
  const base = model.source === "nvidia" ? NVIDIA_CHAT : GATEWAY;
  const json = await post(`${base}/chat/completions`, model.source, {
    model: model.apiModelId,
    messages,
    temperature: opts.temperature ?? 0.5,
    max_tokens: model.isThinking ? Math.max(opts.maxTokens ?? 1024, THINKING_MIN_TOKENS) : (opts.maxTokens ?? 1024),
    stream: false,
  }, model.isThinking ? THINKING_TIMEOUT_MS : TIMEOUT_MS);
  const choice = (json.choices as { message?: { content?: unknown } }[] | undefined)?.[0];
  const message = choice?.message as { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } | undefined;
  const content = message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : "";
  if (!text.trim()) {
    // Reasoning models spend tokens thinking first; with a low limit nothing is left for the answer.
    if (message?.reasoning_content || message?.reasoning) throw Errors.invalid("The model ran out of tokens while thinking. Raise Max tokens (2048 or more) and try again.");
    throw Errors.upstream("The model returned an empty answer. Try again.");
  }
  const usage = usageOf(json.usage);
  await meter(model, "chat", usage, startedAt, json);
  return { text: text.trim(), usage };
}

/** Dense embeddings. NVIDIA's retrieval model needs to know whether the text is a query or a passage. */
export async function embed(model: RunnableModel, input: string, inputType: "query" | "passage"): Promise<{ vector: number[]; usage: Usage }> {
  const startedAt = Date.now();
  const base = model.source === "nvidia" ? NVIDIA_CHAT : GATEWAY;
  const json = await post(`${base}/embeddings`, model.source, {
    model: model.apiModelId,
    input,
    encoding_format: "float",
    ...(model.source === "nvidia" ? { input_type: inputType, truncate: "END" } : {}),
  });
  const vector = (json.data as { embedding?: number[] }[] | undefined)?.[0]?.embedding;
  if (!vector?.length) throw Errors.upstream("The model returned no embedding.");
  const usage = usageOf(json.usage);
  await meter(model, "embedding", usage, startedAt, json);
  return { vector, usage };
}

/** Embeds several texts in one request. The result keeps the order of `inputs`. */
export async function embedMany(model: RunnableModel, inputs: string[], inputType: "query" | "passage"): Promise<{ vectors: number[][]; usage: Usage }> {
  const startedAt = Date.now();
  const base = model.source === "nvidia" ? NVIDIA_CHAT : GATEWAY;
  const json = await post(`${base}/embeddings`, model.source, {
    model: model.apiModelId,
    input: inputs,
    encoding_format: "float",
    ...(model.source === "nvidia" ? { input_type: inputType, truncate: "END" } : {}),
  });
  const data = ((json.data as { embedding?: number[]; index?: number }[] | undefined) ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (data.length !== inputs.length || data.some((d) => !d.embedding?.length)) throw Errors.upstream("The model returned an incomplete set of embeddings.");
  const usage = usageOf(json.usage);
  await meter(model, "embedding", usage, startedAt, json);
  return { vectors: data.map((d) => d.embedding as number[]), usage };
}
/** Text-to-image with Cosmos. Returns a base64 JPEG. */
export async function generateImage(model: RunnableModel, prompt: string): Promise<{ imageBase64: string }> {
  if (model.source !== "nvidia") throw Errors.invalid("Image generation is not available for this model.");
  const startedAt = Date.now();
  const noTokens: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  // FLUX uses NVIDIA's genai route and returns artifacts[].base64; Cosmos uses its own route with a model_mode.
  if (model.apiModelId.includes("flux")) {
    const json = await postWithRetry(`${NVIDIA_AI}/genai/${model.apiModelId}`, "nvidia", { prompt, width: 1024, height: 1024, steps: 4 }, IMAGE_ATTEMPTS, IMAGE_ATTEMPT_MS);
    const image = (json.artifacts as { base64?: string }[] | undefined)?.[0]?.base64;
    if (!image) throw Errors.upstream("The model returned no image (the prompt may have been filtered).");
    await meter(model, "image", noTokens, startedAt);
    return { imageBase64: image };
  }
  let json: Record<string, unknown>;
  try {
    json = await postWithRetry(`${NVIDIA_AI}/cosmos/${model.apiModelId}`, "nvidia", { model_mode: "text2image", prompt, resolution: "480_1_1", num_frames: 1 }, IMAGE_ATTEMPTS, IMAGE_ATTEMPT_MS);
  } catch (e) {
    if (e instanceof ApiError && e.code === "PROVIDER_MODEL") {
      throw new ApiError(502, "PROVIDER_MODEL", "NVIDIA's hosted Cosmos3 Nano route is not live for this key yet (it answers 404). Use FLUX.1 Schnell for image generation.");
    }
    throw e;
  }
  const image = json.b64_image;
  if (typeof image !== "string" || !image) throw Errors.upstream("The model returned no image.");
  await meter(model, "image", noTokens, startedAt);
  return { imageBase64: image };
}

/** Yes/no question about a text, answered by a Decisions API model. Returns the probability of "yes". */
export async function decide(model: RunnableModel, input: string, question: string): Promise<{ probability: number }> {
  if (model.source !== "vercel") throw Errors.invalid("This model does not support decisions.");
  const startedAt = Date.now();
  const json = await post(`${GATEWAY}/decisions`, "vercel", {
    model: model.apiModelId,
    input,
    questions: [{ type: "predicate", name: "answer", instructions: question }],
  });
  const answer = (json.answers as { type?: string; probability?: number }[] | undefined)?.[0];
  if (answer?.type === "refusal") throw Errors.invalid("The model declined to answer this question.");
  if (typeof answer?.probability !== "number") throw Errors.upstream("The model returned no answer.");
  await meter(model, "decision", usageOf(json.usage), startedAt, json);
  return { probability: answer.probability };
}

/** PaliGemma uses NVIDIA's VLM route instead of chat completions and always needs an image. */
export async function vlmText(model: RunnableModel, prompt: string, maxTokens: number, imageDataUrl?: string): Promise<{ text: string; usage: Usage }> {
  // NVIDIA's VLM route needs an image: it is inlined into the text as an <img> tag (inline images must stay under about 180 KB).
  if (!imageDataUrl) throw Errors.invalid("This model describes images. Attach a picture and try again.");
  const startedAt = Date.now();
  const content = `${prompt} <img src="${imageDataUrl}" />`;
  const json = await post(`${NVIDIA_AI}/vlm/${model.apiModelId}`, "nvidia", { messages: [{ role: "user", content }], max_tokens: maxTokens, stream: false });
  const text = ((json.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? "").trim();
  if (!text) throw Errors.upstream("The model returned an empty answer.");
  const usage = usageOf(json.usage);
  await meter(model, "vision", usage, startedAt, json);
  return { text, usage };
}
