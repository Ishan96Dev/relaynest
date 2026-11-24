import "server-only";
import { ApiError } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { logEvent } from "@backend/server/logger";

export interface RateLimitResult {
  limit: number;
  remaining: number;
  resetAtMs: number;
}

const hits = new Map<string, number[]>();
const adminFailures = new Map<string, { count: number; lockedUntil: number }>();

/** Extracts client IP cleanly from Cloudflare / proxy headers. */
export function extractClientIp(req: Request): string {
  const raw =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local";
  return raw.trim().slice(0, 64) || "local";
}

/** Synchronous sliding-window rate limiter for fast per-instance protection. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    logEvent("api", "warn", `Rate limit exceeded [${key}] (${limit}/${Math.round(windowMs / 1000)}s)`);
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait before trying again.", [{ retryAfterSec, limit }]);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
  return { limit, remaining: Math.max(0, limit - recent.length), resetAtMs: now + windowMs };
}

/**
 * Distributed-ready rate limiter: uses Upstash Redis REST (`INCR` + `PEXPIRE`) when configured,
 * falling back seamlessly to the local sliding-window limiter.
 */
export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return rateLimit(key, limit, windowMs);

  const windowBucket = Math.floor(Date.now() / windowMs);
  const redisKey = `rl:${key}:${windowBucket}`;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", redisKey], ["PEXPIRE", redisKey, windowMs]]),
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const json = (await res.json()) as Array<{ result?: number }>;
      const count = Number(json[0]?.result ?? 1);
      if (count > limit) {
        logEvent("api", "warn", `Distributed rate limit exceeded [${key}] (${limit})`);
        throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded. Slow down requests and retry shortly.", [{ limit }]);
      }
      return {
        limit,
        remaining: Math.max(0, limit - count),
        resetAtMs: (windowBucket + 1) * windowMs,
      };
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }
  return rateLimit(key, limit, windowMs);
}

const ADMIN_LOCK_THRESHOLD = 5;
const ADMIN_LOCK_MS = 15 * 60_000;

/** Checks if an IP + admin email pair is temporarily locked after repeated failures. */
export function assertAdminNotLocked(ip: string, email: string): void {
  const key = `${ip}:${email.trim().toLowerCase()}`;
  const entry = adminFailures.get(key);
  if (!entry) return;
  if (entry.lockedUntil > Date.now()) {
    const mins = Math.max(1, Math.ceil((entry.lockedUntil - Date.now()) / 60_000));
    throw new ApiError(429, "ADMIN_LOCKED", `Too many failed attempts. Try again in ${mins} minute(s).`);
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= Date.now()) {
    adminFailures.delete(key);
  }
}

export async function recordAdminFailure(ip: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const key = `${ip}:${normalized}`;
  const cur = adminFailures.get(key) ?? { count: 0, lockedUntil: 0 };
  cur.count += 1;
  if (cur.count >= ADMIN_LOCK_THRESHOLD) {
    cur.lockedUntil = Date.now() + ADMIN_LOCK_MS;
    logEvent("auth", "error", `Security Alert: Admin brute-force lockout triggered for ${normalized} (${ip})`);
  } else {
    logEvent("auth", "warn", `Failed admin login (${cur.count}/${ADMIN_LOCK_THRESHOLD}) for ${normalized} from ${ip}`);
  }
  adminFailures.set(key, cur);

  try {
    await createAdminClient().from("user_audit_logs").insert({
      user_email: normalized || null,
      event: cur.count >= ADMIN_LOCK_THRESHOLD ? "security.admin_lockout" : "security.admin_failed_login",
      page_path: "/admin",
      detail: `Failed admin sign-in attempt (${cur.count}/${ADMIN_LOCK_THRESHOLD})`,
      ip,
    });
  } catch { /* non-blocking audit */ }
}

export function clearAdminFailures(ip: string, email: string): void {
  adminFailures.delete(`${ip}:${email.trim().toLowerCase()}`);
}
