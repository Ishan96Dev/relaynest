import "server-only";

export interface CloudflareRateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

export interface CloudflareTelegramSlotResult {
  allowed: boolean;
  delayMs: number;
  reason?: "cooldown" | "chat_pace" | "bot_pace";
}

export interface RelayNestStateStub {
  ping(): Promise<{ ok: true; engine: "cloudflare-do-sqlite" }>;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string, ttlSeconds: number): Promise<void>;
  kvSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  kvDel(key: string): Promise<void>;
  rateLimitCheck(key: string, limit: number, windowMs: number): Promise<CloudflareRateLimitResult>;
  reserveTelegramSlot(
    chatId: string,
    opts?: { isGroup?: boolean; maxImmediateWaitMs?: number },
  ): Promise<CloudflareTelegramSlotResult>;
  recordTelegramRateLimit(chatId: string, retryAfterSec: number, scope?: "chat" | "bot"): Promise<void>;
}

export interface RelayNestStateNamespace {
  getByName(name: string): RelayNestStateStub;
}

export interface CloudflareQueueBinding {
  send(message: unknown, options?: { delaySeconds?: number; contentType?: "json" | "text" | "bytes" | "v8" }): Promise<void>;
  sendBatch?(
    messages: Iterable<{ body: unknown; delaySeconds?: number; contentType?: "json" | "text" | "bytes" | "v8" }>,
    options?: { delaySeconds?: number },
  ): Promise<void>;
}

export interface CloudflareAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface CloudflareRuntimeBindings {
  RELAYNEST_STATE?: RelayNestStateNamespace;
  RELAYNEST_QUEUE?: CloudflareQueueBinding;
  AI?: CloudflareAiBinding;
}

interface CloudflareExecutionCtx {
  waitUntil?: (promise: Promise<unknown>) => void;
}

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");
let testOverride: CloudflareRuntimeBindings | null | undefined = undefined;

/** Test-only hook to inject mock Cloudflare bindings during Node unit tests. */
export function __setTestCloudflareBindings(bindings: CloudflareRuntimeBindings | null | undefined): void {
  testOverride = bindings;
}

/**
 * Safely reads Cloudflare Worker bindings from OpenNext's global context symbol.
 * Returns `null` outside Cloudflare Workers (local Node dev, Vercel, unit tests) without throwing.
 */
export function getCloudflareBindings(): CloudflareRuntimeBindings | null {
  if (testOverride !== undefined) return testOverride;
  const ctx = (globalThis as Record<symbol, { env?: CloudflareRuntimeBindings } | undefined>)[CLOUDFLARE_CONTEXT_SYMBOL];
  const env = ctx?.env;
  if (!env || typeof env !== "object") return null;
  if (!env.RELAYNEST_STATE && !env.RELAYNEST_QUEUE && !env.AI) return null;
  return env;
}

/**
 * Registers a short fire-and-forget background task (e.g. usage metering) with Cloudflare's `ctx.waitUntil`
 * so the Worker isolate does not drop the promise as soon as the HTTP response finishes.
 */
export function runInCloudflareWaitUntil(promise: Promise<unknown>): boolean {
  const execCtx = (globalThis as Record<symbol, { ctx?: CloudflareExecutionCtx } | undefined>)[CLOUDFLARE_CONTEXT_SYMBOL]?.ctx;
  if (!execCtx || typeof execCtx.waitUntil !== "function") return false;
  try {
    execCtx.waitUntil(promise);
    return true;
  } catch {
    return false;
  }
}

export function getCloudflareStateStub(shardKey: string): RelayNestStateStub | null {
  const ns = getCloudflareBindings()?.RELAYNEST_STATE;
  if (!ns || typeof ns.getByName !== "function") return null;
  return ns.getByName(shardKey);
}

export function getCloudflareQueue(): CloudflareQueueBinding | null {
  const q = getCloudflareBindings()?.RELAYNEST_QUEUE;
  if (!q || typeof q.send !== "function") return null;
  return q;
}

export function getCloudflareAi(): CloudflareAiBinding | null {
  const ai = getCloudflareBindings()?.AI;
  if (!ai || typeof ai.run !== "function") return null;
  return ai;
}

export function isCloudflareStateConfigured(): boolean {
  return Boolean(getCloudflareBindings()?.RELAYNEST_STATE);
}

export function isCloudflareQueueConfigured(): boolean {
  return Boolean(getCloudflareBindings()?.RELAYNEST_QUEUE);
}
