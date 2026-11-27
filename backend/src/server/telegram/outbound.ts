import "server-only";
import { redisGet, redisSet } from "@backend/server/cache/redis";
import { getCloudflareStateStub, isCloudflareQueueConfigured } from "@backend/server/cloudflare/bindings";
import { logEvent } from "@backend/server/logger";
import { publishKafkaEvent } from "@backend/server/queue/kafka";
import {
  getTelegramRetryAfterSec,
  isTelegramRateLimitError,
  sendFormattedMessage,
  sendMessage,
} from "@backend/server/telegram/client";

const BOT_MIN_INTERVAL_MS = 40;
const PRIVATE_CHAT_INTERVAL_MS = 1_050;
const GROUP_CHAT_INTERVAL_MS = 3_100;

interface LocalScopeState {
  nextAllowedMs: number;
  cooldownUntilMs: number;
}

const localBotScopes = new Map<string, LocalScopeState>();

export interface OutboundTelegramJob {
  botId: string;
  workspaceId: string;
  chatId: string;
  kind: "text" | "formatted";
  text?: string;
  html?: string;
  plainFallback?: string;
  linkPreviewUrl?: string;
  preferLargeMedia?: boolean;
  isGroup?: boolean;
  idempotencyKey?: string;
}

export interface DispatchTelegramResult {
  delivered: boolean;
  queued: boolean;
  messageId?: number;
  retryAfterSec?: number;
}

export function isGroupChatId(chatId: string | number): boolean {
  const s = String(chatId).trim();
  return s.startsWith("-") && /^-\d+$/.test(s);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLocal(key: string): LocalScopeState {
  return localBotScopes.get(key) ?? { nextAllowedMs: 0, cooldownUntilMs: 0 };
}

function writeLocal(key: string, nextAllowedMs: number, cooldownUntilMs: number): void {
  localBotScopes.set(key, { nextAllowedMs, cooldownUntilMs });
  if (localBotScopes.size > 4000) {
    const now = Date.now();
    for (const [k, v] of localBotScopes) {
      if (v.nextAllowedMs <= now && v.cooldownUntilMs <= now) localBotScopes.delete(k);
    }
  }
}

/** Test-only reset for local pacing state. */
export function __resetLocalTelegramPacing(): void {
  localBotScopes.clear();
}

/**
 * Reserves an outbound Telegram send slot for `(botId, chatId)`.
 * Uses the per-bot SQLite Durable Object (`tg-bot:${botId}`) on Cloudflare Workers,
 * or Redis cooldown + local per-bot pacing fallback on Node/Vercel.
 */
export async function reserveTelegramSendSlot(
  botId: string,
  chatId: string | number,
  opts?: { isGroup?: boolean; maxImmediateWaitMs?: number },
): Promise<{ allowed: boolean; delayMs: number; reason?: "cooldown" | "chat_pace" | "bot_pace" }> {
  const cid = String(chatId);
  const isGroup = opts?.isGroup ?? isGroupChatId(cid);
  const maxImmediateWaitMs = opts?.maxImmediateWaitMs ?? 1_200;

  const stub = getCloudflareStateStub(`tg-bot:${botId}`);
  if (stub) {
    try {
      return await stub.reserveTelegramSlot(cid, { isGroup, maxImmediateWaitMs });
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare DO reserveTelegramSlot failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const now = Date.now();
  // Check distributed cooldown hint if Upstash Redis is configured outside Cloudflare.
  const cooldownRaw = await redisGet(`tg:cd:${botId}:${cid}`).catch(() => null);
  const redisCooldownUntil = cooldownRaw ? Number(cooldownRaw) : 0;
  if (Number.isFinite(redisCooldownUntil) && redisCooldownUntil > now) {
    return { allowed: false, delayMs: Math.max(250, redisCooldownUntil - now), reason: "cooldown" };
  }

  const botKey = `bot:${botId}`;
  const chatKey = `chat:${botId}:${cid}`;
  const bot = readLocal(botKey);
  const chat = readLocal(chatKey);

  const cooldownUntil = Math.max(bot.cooldownUntilMs, chat.cooldownUntilMs);
  if (cooldownUntil > now) {
    return { allowed: false, delayMs: Math.max(250, cooldownUntil - now), reason: "cooldown" };
  }

  const earliest = Math.max(now, bot.nextAllowedMs, chat.nextAllowedMs);
  const waitMs = Math.max(0, earliest - now);
  if (waitMs > maxImmediateWaitMs) {
    return {
      allowed: false,
      delayMs: waitMs,
      reason: chat.nextAllowedMs >= bot.nextAllowedMs ? "chat_pace" : "bot_pace",
    };
  }

  const chatStep = isGroup ? GROUP_CHAT_INTERVAL_MS : PRIVATE_CHAT_INTERVAL_MS;
  writeLocal(botKey, earliest + BOT_MIN_INTERVAL_MS, bot.cooldownUntilMs);
  writeLocal(chatKey, earliest + chatStep, chat.cooldownUntilMs);
  return { allowed: true, delayMs: waitMs };
}

/** Records a Telegram HTTP 429 `retry_after` cooldown across isolates so concurrent sends immediately pause. */
export async function recordTelegramCooldown(
  botId: string,
  chatId: string | number,
  retryAfterSec: number,
  scope: "chat" | "bot" = "chat",
): Promise<void> {
  const cid = String(chatId);
  const clampedSec = Math.min(Math.max(1, Math.ceil(retryAfterSec)), 300);

  const stub = getCloudflareStateStub(`tg-bot:${botId}`);
  if (stub) {
    try {
      await stub.recordTelegramRateLimit(cid, clampedSec, scope);
      return;
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare DO recordTelegramRateLimit failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const now = Date.now();
  const until = now + clampedSec * 1000 + 250;
  const chatKey = `chat:${botId}:${cid}`;
  const chat = readLocal(chatKey);
  writeLocal(chatKey, Math.max(chat.nextAllowedMs, until), Math.max(chat.cooldownUntilMs, until));
  if (scope === "bot" || clampedSec >= 10) {
    const botKey = `bot:${botId}`;
    const bot = readLocal(botKey);
    const botUntil = scope === "bot" ? until : Math.max(bot.cooldownUntilMs, now + Math.min(clampedSec, 5) * 1000);
    writeLocal(botKey, Math.max(bot.nextAllowedMs, botUntil), Math.max(bot.cooldownUntilMs, botUntil));
  }
  await redisSet(`tg:cd:${botId}:${cid}`, String(until), clampedSec + 2).catch(() => undefined);
}

/** Enqueues an outbound Telegram message onto Cloudflare Queues / Kafka without storing raw bot tokens. */
export async function enqueueTelegramOutbound(job: OutboundTelegramJob, delaySeconds = 1): Promise<boolean> {
  const safeDelay = Math.min(Math.max(1, Math.ceil(delaySeconds)), 3600);
  return publishKafkaEvent(
    "telegram.outbound",
    job as unknown as Record<string, unknown>,
    `${job.botId}:${job.chatId}`,
    { delaySeconds: safeDelay },
  );
}

async function sendNow(token: string, job: OutboundTelegramJob): Promise<{ message_id: number }> {
  if (job.kind === "formatted") {
    return sendFormattedMessage(token, job.chatId, job.html ?? job.plainFallback ?? "", job.plainFallback ?? job.html ?? "", {
      linkPreviewUrl: job.linkPreviewUrl,
      preferLargeMedia: job.preferLargeMedia,
    });
  }
  return sendMessage(token, job.chatId, job.text ?? "");
}

/**
 * Dispatches one Telegram message with per-bot/per-chat pacing and `429 retry_after` protection.
 * - If the bot/chat is under heavy load or cooling down and Cloudflare Queues is bound, queues it with exact delay.
 * - If Telegram returns `429`, records the cooldown and either enqueues with `retry_after` or retries once for short delays.
 */
export async function dispatchTelegramMessage(
  input: OutboundTelegramJob & { token: string },
): Promise<DispatchTelegramResult> {
  const { token, ...job } = input;
  const canQueue = isCloudflareQueueConfigured();
  const slot = await reserveTelegramSendSlot(job.botId, job.chatId, {
    isGroup: job.isGroup,
    maxImmediateWaitMs: canQueue ? 1_200 : 3_500,
  });

  if (!slot.allowed) {
    const delaySec = Math.max(1, Math.ceil(slot.delayMs / 1000));
    if (canQueue) {
      const queued = await enqueueTelegramOutbound(job, delaySec);
      if (queued) {
        logEvent("queue", "info", `Paced Telegram send queued (${slot.reason ?? "paced"}, +${delaySec}s)`, {
          botId: job.botId,
          chatId: job.chatId,
        });
        return { delivered: false, queued: true, retryAfterSec: delaySec };
      }
    }
    if (slot.delayMs <= 5_000) {
      await sleep(slot.delayMs);
    } else {
      throw new Error(`Telegram pacing delay too long (${delaySec}s) without queue backend.`);
    }
  } else if (slot.delayMs > 0) {
    await sleep(slot.delayMs);
  }

  try {
    const res = await sendNow(token, job);
    return { delivered: true, queued: false, messageId: res.message_id };
  } catch (err) {
    if (!isTelegramRateLimitError(err)) throw err;
    const retryAfterSec = getTelegramRetryAfterSec(err) ?? 5;
    await recordTelegramCooldown(job.botId, job.chatId, retryAfterSec);

    if (canQueue) {
      const queued = await enqueueTelegramOutbound(job, retryAfterSec + 1);
      if (queued) {
        logEvent("queue", "warn", `Telegram 429 (retry_after=${retryAfterSec}s): requeued outbound message`, {
          botId: job.botId,
          chatId: job.chatId,
        });
        return { delivered: false, queued: true, retryAfterSec };
      }
    }

    if (retryAfterSec <= 5) {
      await sleep(retryAfterSec * 1000 + 250);
      const retryRes = await sendNow(token, job);
      return { delivered: true, queued: false, messageId: retryRes.message_id };
    }
    throw err;
  }
}

/**
 * Dispatches multi-part rich Telegram HTML chunks in strict order with pacing.
 * If an earlier chunk gets deferred onto Cloudflare Queues, subsequent chunks are also queued with staggered delays
 * so message order stays intact.
 */
export async function dispatchTelegramFormattedMessages(input: {
  botId: string;
  workspaceId: string;
  token: string;
  chatId: number | string;
  htmlChunks: string[];
  plainChunks: string[];
  linkPreviewUrl?: string;
  preferLargeMedia?: boolean;
  isGroup?: boolean;
}): Promise<{ deliveredCount: number; queuedCount: number; messageIds: number[] }> {
  const count = Math.max(input.htmlChunks.length, 1);
  const cid = String(input.chatId);
  const isGroup = input.isGroup ?? isGroupChatId(cid);
  const stepSec = isGroup ? 4 : 2;
  let deliveredCount = 0;
  let queuedCount = 0;
  const messageIds: number[] = [];
  let queuedOffsetSec: number | null = null;

  for (let i = 0; i < count; i++) {
    const html = input.htmlChunks[i] ?? input.plainChunks[i] ?? "";
    const plain = input.plainChunks[i] ?? input.htmlChunks[i] ?? "";
    if (!html && !plain) continue;
    const isLast = i === count - 1;
    const job: OutboundTelegramJob = {
      botId: input.botId,
      workspaceId: input.workspaceId,
      chatId: cid,
      kind: "formatted",
      html,
      plainFallback: plain,
      ...(isLast && input.linkPreviewUrl ? { linkPreviewUrl: input.linkPreviewUrl } : {}),
      ...(isLast && input.preferLargeMedia ? { preferLargeMedia: input.preferLargeMedia } : {}),
      isGroup,
    };

    if (queuedOffsetSec !== null) {
      queuedOffsetSec += stepSec;
      const queued = await enqueueTelegramOutbound(job, queuedOffsetSec);
      if (queued) {
        queuedCount += 1;
        continue;
      }
    }

    const res = await dispatchTelegramMessage({ ...job, token: input.token });
    if (res.delivered) {
      deliveredCount += 1;
      if (typeof res.messageId === "number") messageIds.push(res.messageId);
    } else if (res.queued) {
      queuedCount += 1;
      queuedOffsetSec = res.retryAfterSec ?? stepSec;
    }
  }

  return { deliveredCount, queuedCount, messageIds };
}
