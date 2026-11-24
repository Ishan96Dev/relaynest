import "server-only";
import { redisEnv } from "@backend/lib/env/streaming";
import { logEvent } from "@backend/server/logger";

/**
 * Distributed Redis client over HTTPS REST (Upstash Redis REST compatible, zero TCP sockets so it runs on Cloudflare Workers).
 * Falls back transparently to an in-memory Map when UPSTASH_REDIS_REST_URL is not configured.
 */
const mem = new Map<string, { value: string; expiresAt: number }>();

export function isRedisConfigured(): boolean {
  const e = redisEnv();
  return Boolean(e.url && e.token);
}

async function cmd<T = unknown>(parts: (string | number)[]): Promise<T | null> {
  const { url, token } = redisEnv();
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      logEvent("queue", "warn", `Redis HTTP ${res.status} on ${parts[0]}`);
      return null;
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) {
      logEvent("queue", "warn", `Redis error on ${parts[0]}: ${json.error}`);
      return null;
    }
    return (json.result ?? null) as T | null;
  } catch (e) {
    logEvent("queue", "warn", `Redis unreachable: ${e instanceof Error ? e.message : "network"}`);
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  if (isRedisConfigured()) return cmd<string>(["GET", key]);
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { mem.delete(key); return null; }
  return hit.value;
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (isRedisConfigured()) {
    await cmd(["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds))]);
    return;
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Sets a key only if absent (NX). Returns true if set (first caller wins), false if it already existed. */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (isRedisConfigured()) {
    const res = await cmd<string | null>(["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds)), "NX"]);
    return res === "OK";
  }
  const hit = mem.get(key);
  if (hit && Date.now() <= hit.expiresAt) return false;
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

export async function redisDel(key: string): Promise<void> {
  mem.delete(key);
  if (isRedisConfigured()) await cmd(["DEL", key]);
}

export async function redisPing(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const t = Date.now();
  if (!isRedisConfigured()) return { ok: false, detail: "In-memory fallback active (set UPSTASH_REDIS_REST_URL & TOKEN)", latencyMs: 0 };
  const pong = await cmd<string>(["PING"]);
  return { ok: pong === "PONG", detail: pong === "PONG" ? "PONG · Upstash Redis REST connected" : "Ping failed", latencyMs: Date.now() - t };
}
