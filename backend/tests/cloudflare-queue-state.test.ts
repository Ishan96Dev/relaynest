import { after, before, beforeEach, describe, it } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "./expect";
import {
  __setTestCloudflareBindings,
  type CloudflareQueueBinding,
  type RelayNestStateStub,
} from "../src/server/cloudflare/bindings";

/** In-memory simulation of RelayNestState (SQLite DO) + Cloudflare Queues for end-to-end tests. */
function createFakeCloudflarePlatform() {
  const kv = new Map<string, { value: string; expiresAt: number }>();
  const rl = new Map<string, number>();
  const pacing = new Map<string, { nextAllowedMs: number; cooldownUntilMs: number }>();
  const sentQueue: Array<{ body: unknown; delaySeconds?: number }> = [];

  function makeStub(shard: string): RelayNestStateStub {
    return {
      async ping() {
        return { ok: true, engine: "cloudflare-do-sqlite" };
      },
      async kvGet(key) {
        const hit = kv.get(`${shard}:${key}`);
        if (!hit || hit.expiresAt <= Date.now()) return null;
        return hit.value;
      },
      async kvSet(key, value, ttlSeconds) {
        kv.set(`${shard}:${key}`, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      },
      async kvSetNx(key, value, ttlSeconds) {
        const k = `${shard}:${key}`;
        const hit = kv.get(k);
        if (hit && hit.expiresAt > Date.now()) return false;
        kv.set(k, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        return true;
      },
      async kvDel(key) {
        kv.delete(`${shard}:${key}`);
      },
      async rateLimitCheck(key, limit, windowMs) {
        const bucket = Math.floor(Date.now() / windowMs);
        const k = `${shard}:${key}:${bucket}`;
        const count = (rl.get(k) ?? 0) + 1;
        rl.set(k, count);
        const resetAtMs = (bucket + 1) * windowMs;
        return {
          allowed: count <= limit,
          count,
          remaining: Math.max(0, limit - count),
          resetAtMs,
          retryAfterSec: Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000)),
        };
      },
      async reserveTelegramSlot(chatId, opts) {
        const now = Date.now();
        const botKey = `${shard}:bot`;
        const chatKey = `${shard}:chat:${chatId}`;
        const bot = pacing.get(botKey) ?? { nextAllowedMs: 0, cooldownUntilMs: 0 };
        const chat = pacing.get(chatKey) ?? { nextAllowedMs: 0, cooldownUntilMs: 0 };
        const cooldownUntil = Math.max(bot.cooldownUntilMs, chat.cooldownUntilMs);
        if (cooldownUntil > now) {
          return { allowed: false, delayMs: Math.max(250, cooldownUntil - now), reason: "cooldown" };
        }
        const earliest = Math.max(now, bot.nextAllowedMs, chat.nextAllowedMs);
        const waitMs = Math.max(0, earliest - now);
        const maxImmediateWaitMs = opts?.maxImmediateWaitMs ?? 1_200;
        if (waitMs > maxImmediateWaitMs) {
          return { allowed: false, delayMs: waitMs, reason: "chat_pace" };
        }
        const chatStep = opts?.isGroup ? 3_100 : 1_050;
        pacing.set(botKey, { nextAllowedMs: earliest + 40, cooldownUntilMs: bot.cooldownUntilMs });
        pacing.set(chatKey, { nextAllowedMs: earliest + chatStep, cooldownUntilMs: chat.cooldownUntilMs });
        return { allowed: true, delayMs: waitMs };
      },
      async recordTelegramRateLimit(chatId, retryAfterSec) {
        const until = Date.now() + retryAfterSec * 1000 + 250;
        const chatKey = `${shard}:chat:${chatId}`;
        const chat = pacing.get(chatKey) ?? { nextAllowedMs: 0, cooldownUntilMs: 0 };
        pacing.set(chatKey, {
          nextAllowedMs: Math.max(chat.nextAllowedMs, until),
          cooldownUntilMs: Math.max(chat.cooldownUntilMs, until),
        });
      },
    };
  }

  const queue: CloudflareQueueBinding = {
    async send(body, options) {
      sentQueue.push({ body, delaySeconds: options?.delaySeconds });
    },
  };

  return {
    bindings: {
      RELAYNEST_STATE: { getByName: makeStub },
      RELAYNEST_QUEUE: queue,
    },
    sentQueue,
    pacing,
  };
}

let tgServer: http.Server;
let tgCalls = 0;

before(async () => {
  tgServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      tgCalls += 1;
      res.setHeader("content-type", "application/json");
      if (req.url?.includes("/botflood:")) {
        res.statusCode = 429;
        return void res.end(
          JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 9 } }),
        );
      }
      res.end(JSON.stringify({ ok: true, result: { message_id: 100 + tgCalls } }));
    });
  });
  await new Promise<void>((resolve) => tgServer.listen(0, "127.0.0.1", resolve));
  const { port } = tgServer.address() as AddressInfo;
  process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SECRET_KEY = "test";
  process.env.ENCRYPTION_KEY = "0".repeat(63) + "1";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KAFKA_REST_URL;
  delete process.env.UPSTASH_KAFKA_REST_URL;
});

after(() => {
  __setTestCloudflareBindings(undefined);
  tgServer.close();
});

beforeEach(() => {
  tgCalls = 0;
  __setTestCloudflareBindings(undefined);
});

describe("Cloudflare Durable Object cache, rate limit, and Queue adapters", () => {
  it("routes Redis operations and pings through Cloudflare Durable Object SQLite", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { redisBackendKind, redisDel, redisGet, redisPing, redisSet, redisSetNx } = await import(
      "../src/server/cache/redis"
    );
    expect(redisBackendKind()).toBe("cloudflare-do");

    const ping = await redisPing();
    expect(ping.ok).toBe(true);
    expect(ping.detail).toContain("Cloudflare Durable Object");

    expect(await redisSetNx("tg:upd:bot1:99", "1", 60)).toBe(true);
    expect(await redisSetNx("tg:upd:bot1:99", "1", 60)).toBe(false);
    await redisSet("demo:key", "hello", 60);
    expect(await redisGet("demo:key")).toBe("hello");
    await redisDel("demo:key");
    expect(await redisGet("demo:key")).toBe(null);
  });

  it("enforces distributed rate limits via Cloudflare Durable Object SQLite", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { enforceRateLimit, isDistributedRateLimitActive } = await import("../src/server/security/rate-limit");
    expect(isDistributedRateLimitActive()).toBe(true);

    const r1 = await enforceRateLimit("chat:botA:55", 2, 60_000);
    expect(r1.remaining).toBe(1);
    const r2 = await enforceRateLimit("chat:botA:55", 2, 60_000);
    expect(r2.remaining).toBe(0);
    await expect(enforceRateLimit("chat:botA:55", 2, 60_000)).rejects.toBeTruthy();
  });

  it("publishes events and delays onto Cloudflare Queues and reports healthy kafkaPing", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { kafkaPing, publishKafkaEvent, queueBackendKind } = await import("../src/server/queue/kafka");
    expect(queueBackendKind()).toBe("cloudflare-queues");

    const ping = await kafkaPing();
    expect(ping.ok).toBe(true);
    expect(ping.detail).toContain("Cloudflare Queues");

    const ok = await publishKafkaEvent("workflows.execute", { workflowId: "wf_1" }, "bot_1", { delaySeconds: 7 });
    expect(ok).toBe(true);
    expect(fake.sentQueue.length).toBe(1);
    expect(fake.sentQueue[0]?.delaySeconds).toBe(7);
    expect((fake.sentQueue[0]?.body as { topic: string }).topic).toBe("workflows.execute");
  });

  it("requeues Telegram 429s with retry_after delay without storing raw tokens, and pauses concurrent sends", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { dispatchTelegramMessage } = await import("../src/server/telegram/outbound");

    // 1. First send hits Telegram 429 (retry_after: 9) -> records cooldown & queues without token.
    const first = await dispatchTelegramMessage({
      botId: "bot_flood",
      workspaceId: "ws_1",
      token: "flood:SECRET_DO_NOT_QUEUE",
      chatId: "42",
      kind: "text",
      text: "Hello world",
    });
    expect(first.delivered).toBe(false);
    expect(first.queued).toBe(true);
    expect(first.retryAfterSec).toBe(9);
    expect(fake.sentQueue.length).toBe(1);
    expect(fake.sentQueue[0]?.delaySeconds).toBe(10);
    expect(JSON.stringify(fake.sentQueue[0]?.body)).not.toContain("SECRET_DO_NOT_QUEUE");

    // 2. Concurrent second send to the same bot/chat sees active cooldown and queues immediately without calling Telegram.
    const callsBefore = tgCalls;
    const second = await dispatchTelegramMessage({
      botId: "bot_flood",
      workspaceId: "ws_1",
      token: "flood:SECRET_DO_NOT_QUEUE",
      chatId: "42",
      kind: "text",
      text: "Second message",
    });
    expect(second.queued).toBe(true);
    expect(tgCalls).toBe(callsBefore);
    expect(fake.sentQueue.length).toBe(2);
  });

  it("defers queued outbound messages in consumer while bot/chat is in cooldown", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { recordTelegramCooldown } = await import("../src/server/telegram/outbound");
    const { processQueueEnvelope } = await import("../src/server/queue/consumer");

    await recordTelegramCooldown("bot_cool", "-100123456", 15);
    const outcome = await processQueueEnvelope(
      {
        topic: "telegram.outbound",
        payload: {
          botId: "bot_cool",
          workspaceId: "ws_1",
          chatId: "-100123456",
          kind: "text",
          text: "Group broadcast",
          isGroup: true,
        },
        ts: new Date().toISOString(),
      },
      1,
    );
    expect(outcome.action).toBe("retry");
    expect((outcome.delaySeconds ?? 0) >= 14).toBe(true);
  });

  it("acknowledges telemetry-only telegram.updates envelopes and retries transient consumer errors up to 3 attempts", async () => {
    const fake = createFakeCloudflarePlatform();
    __setTestCloudflareBindings(fake.bindings);

    const { processQueueEnvelope } = await import("../src/server/queue/consumer");

    // Telemetry-only telegram.updates envelope (no execute flag) acks cleanly.
    const telemetry = await processQueueEnvelope(
      {
        topic: "telegram.updates",
        payload: { botId: "bot_1", workspaceId: "ws_1", updateId: 123 },
        key: "bot_1",
        ts: new Date().toISOString(),
      },
      1,
    );
    expect(telemetry.action).toBe("ack");
    expect(telemetry.reason).toBe("event_processed");

    // Executable telegram.updates throwing a pre-handler error triggers retry on attempt 1, and acks after exhaustion on attempt 3.
    const prevKey = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SECRET_KEY = "";
    try {
      const envPayload = {
        topic: "telegram.updates" as const,
        payload: {
          execute: true,
          bot: { id: "bot_1", workspace_id: "ws_1", welcome_message: null, default_response: null, telegram_username: "test_bot" },
          update: { update_id: 456, message: { message_id: 1, text: "/imagine goku", chat: { id: 9, type: "private" } } },
        },
        key: "bot_1",
        ts: new Date().toISOString(),
      };
      const first = await processQueueEnvelope(envPayload, 1);
      expect(first.action).toBe("retry");
      const exhausted = await processQueueEnvelope(envPayload, 3);
      expect(exhausted.action).toBe("ack");
      expect(exhausted.reason).toBe("telegram_update_failed_exhausted");
    } finally {
      if (prevKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = prevKey;
    }
  });
});
