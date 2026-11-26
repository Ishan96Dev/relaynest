import { DurableObject } from "cloudflare:workers";

export interface RateLimitCheckResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

export interface TelegramSlotReservation {
  allowed: boolean;
  delayMs: number;
  reason?: "cooldown" | "chat_pace" | "bot_pace";
}

// Conservative pacing budgets below Telegram's official Bot API limits:
// - Global per bot: ~30 msg/s -> space sends by 40ms (~25 msg/s)
// - Single private chat: ~1 msg/s -> 1050ms
// - Group / supergroup (negative chat ID): ~20 msg/min -> 3100ms
const BOT_MIN_INTERVAL_MS = 40;
const PRIVATE_CHAT_INTERVAL_MS = 1_050;
const GROUP_CHAT_INTERVAL_MS = 3_100;

/**
 * Strongly consistent, SQLite-backed Durable Object (Workers Free Tier compatible)
 * providing distributed Redis-like cache/dedupe (`GET`, `SET`, `SET NX`, `DEL`),
 * sliding/fixed-window rate limiting, and per-bot / per-chat Telegram send pacing
 * + `429 retry_after` cooldown coordination across all Worker isolates.
 *
 * Shard deterministically via `env.RELAYNEST_STATE.getByName(shardKey)`:
 * - `kv:<bucket>` for cache & deduplication keys
 * - `rl:<key>` for rate-limit buckets
 * - `tg-bot:<botId>` for per-bot Telegram outbound pacing & cooldowns
 */
export class RelayNestState extends DurableObject<Record<string, unknown>> {
  private writesSincePrune = 0;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS kv_entries (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_entries (expires_at);

        CREATE TABLE IF NOT EXISTS rate_buckets (
          bucket_key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tg_pacing (
          scope TEXT PRIMARY KEY,
          next_allowed_ms INTEGER NOT NULL,
          cooldown_until_ms INTEGER NOT NULL
        );
      `);
    });
  }

  private maybePrune(now: number): void {
    this.writesSincePrune += 1;
    if (this.writesSincePrune < 64) return;
    this.writesSincePrune = 0;
    this.ctx.storage.sql.exec("DELETE FROM kv_entries WHERE expires_at <= ?", now);
    this.ctx.storage.sql.exec("DELETE FROM rate_buckets WHERE expires_at <= ?", now);
  }

  async ping(): Promise<{ ok: true; engine: "cloudflare-do-sqlite" }> {
    return { ok: true, engine: "cloudflare-do-sqlite" };
  }

  async kvGet(key: string): Promise<string | null> {
    const now = Date.now();
    const row = this.ctx.storage.sql
      .exec<{ value: string; expires_at: number }>(
        "SELECT value, expires_at FROM kv_entries WHERE key = ?",
        key,
      )
      .toArray()[0];
    if (!row) return null;
    if (row.expires_at <= now) {
      this.ctx.storage.sql.exec("DELETE FROM kv_entries WHERE key = ?", key);
      return null;
    }
    return row.value;
  }

  async kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    const expiresAt = now + Math.max(1, Math.round(ttlSeconds)) * 1000;
    this.ctx.storage.sql.exec(
      "INSERT INTO kv_entries (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
      key,
      value,
      expiresAt,
    );
    this.maybePrune(now);
  }

  async kvSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.ctx.storage.sql
      .exec<{ expires_at: number }>("SELECT expires_at FROM kv_entries WHERE key = ?", key)
      .toArray()[0];
    if (existing && existing.expires_at > now) return false;
    const expiresAt = now + Math.max(1, Math.round(ttlSeconds)) * 1000;
    this.ctx.storage.sql.exec(
      "INSERT INTO kv_entries (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
      key,
      value,
      expiresAt,
    );
    this.maybePrune(now);
    return true;
  }

  async kvDel(key: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM kv_entries WHERE key = ?", key);
  }

  async rateLimitCheck(key: string, limit: number, windowMs: number): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const safeWindow = Math.max(1000, Math.round(windowMs));
    const windowBucket = Math.floor(now / safeWindow);
    const bucketKey = `${key}:${windowBucket}`;
    const resetAtMs = (windowBucket + 1) * safeWindow;

    const existing = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT count FROM rate_buckets WHERE bucket_key = ?", bucketKey)
      .toArray()[0];
    const nextCount = (existing?.count ?? 0) + 1;

    this.ctx.storage.sql.exec(
      "INSERT INTO rate_buckets (bucket_key, count, expires_at) VALUES (?, ?, ?) ON CONFLICT(bucket_key) DO UPDATE SET count = excluded.count, expires_at = excluded.expires_at",
      bucketKey,
      nextCount,
      resetAtMs + 5_000,
    );
    this.maybePrune(now);

    const allowed = nextCount <= limit;
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    return {
      allowed,
      count: nextCount,
      remaining: Math.max(0, limit - nextCount),
      resetAtMs,
      retryAfterSec,
    };
  }

  private readScope(scope: string): { nextAllowedMs: number; cooldownUntilMs: number } {
    const row = this.ctx.storage.sql
      .exec<{ next_allowed_ms: number; cooldown_until_ms: number }>(
        "SELECT next_allowed_ms, cooldown_until_ms FROM tg_pacing WHERE scope = ?",
        scope,
      )
      .toArray()[0];
    return {
      nextAllowedMs: row?.next_allowed_ms ?? 0,
      cooldownUntilMs: row?.cooldown_until_ms ?? 0,
    };
  }

  private writeScope(scope: string, nextAllowedMs: number, cooldownUntilMs: number): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO tg_pacing (scope, next_allowed_ms, cooldown_until_ms) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET next_allowed_ms = excluded.next_allowed_ms, cooldown_until_ms = excluded.cooldown_until_ms",
      scope,
      nextAllowedMs,
      cooldownUntilMs,
    );
  }

  /**
   * Reserves an outbound Telegram send slot for a chat on this bot.
   * - If the bot or chat is in a Telegram `429` cooldown, returns `{ allowed: false, delayMs, reason: "cooldown" }`.
   * - If the earliest slot is within `maxImmediateWaitMs`, advances both bot & chat cursors atomically and returns `{ allowed: true, delayMs }`.
   * - Otherwise leaves cursors untouched and asks the caller/Queue to retry after `delayMs`.
   */
  async reserveTelegramSlot(
    chatId: string,
    opts?: { isGroup?: boolean; maxImmediateWaitMs?: number },
  ): Promise<TelegramSlotReservation> {
    const now = Date.now();
    const chatScope = `chat:${chatId}`;
    const bot = this.readScope("bot");
    const chat = this.readScope(chatScope);

    const cooldownUntil = Math.max(bot.cooldownUntilMs, chat.cooldownUntilMs);
    if (cooldownUntil > now) {
      return {
        allowed: false,
        delayMs: Math.max(250, cooldownUntil - now),
        reason: "cooldown",
      };
    }

    const earliest = Math.max(now, bot.nextAllowedMs, chat.nextAllowedMs);
    const waitMs = Math.max(0, earliest - now);
    const maxImmediateWaitMs = opts?.maxImmediateWaitMs ?? 1_200;

    if (waitMs > maxImmediateWaitMs) {
      return {
        allowed: false,
        delayMs: waitMs,
        reason: chat.nextAllowedMs >= bot.nextAllowedMs ? "chat_pace" : "bot_pace",
      };
    }

    const isGroup = opts?.isGroup ?? (chatId.startsWith("-") && /^-\d+$/.test(chatId));
    const chatStep = isGroup ? GROUP_CHAT_INTERVAL_MS : PRIVATE_CHAT_INTERVAL_MS;

    this.writeScope("bot", earliest + BOT_MIN_INTERVAL_MS, bot.cooldownUntilMs);
    this.writeScope(chatScope, earliest + chatStep, chat.cooldownUntilMs);

    return { allowed: true, delayMs: waitMs };
  }

  /** Records a Telegram HTTP `429` `retry_after` hint so concurrent isolates immediately back off. */
  async recordTelegramRateLimit(
    chatId: string,
    retryAfterSec: number,
    scope: "chat" | "bot" = "chat",
  ): Promise<void> {
    const now = Date.now();
    const clampedSec = Math.min(Math.max(1, Math.ceil(retryAfterSec)), 300);
    const until = now + clampedSec * 1000 + 250;

    const chatScope = `chat:${chatId}`;
    const chat = this.readScope(chatScope);
    this.writeScope(chatScope, Math.max(chat.nextAllowedMs, until), Math.max(chat.cooldownUntilMs, until));

    if (scope === "bot" || clampedSec >= 10) {
      const bot = this.readScope("bot");
      const botUntil = scope === "bot" ? until : Math.max(bot.cooldownUntilMs, now + Math.min(clampedSec, 5) * 1000);
      this.writeScope("bot", Math.max(bot.nextAllowedMs, botUntil), Math.max(bot.cooldownUntilMs, botUntil));
    }
  }
}
