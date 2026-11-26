import "server-only";
import { redisEnv } from "@backend/lib/env/streaming";
import { getCloudflareStateStub, isCloudflareStateConfigured } from "@backend/server/cloudflare/bindings";
import { logEvent } from "@backend/server/logger";

/**
 * Distributed cache & atomic coordination store:
 * 1. Upstash Redis REST when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set.
 * 2. Cloudflare Durable Object SQLite (`RELAYNEST_STATE`) when running on Cloudflare Workers (free tier, zero external latency).
 * 3. In-memory Map fallback for local Node development.
 */
const mem = new Map<string, { value: string; expiresAt: number }>();

export type RedisBackendKind = "upstash" | "cloudflare-do" | "memory";

export function isUpstashRedisConfigured(): boolean {
  const e = redisEnv();
  return Boolean(e.url && e.token);
}

export function redisBackendKind(): RedisBackendKind {
  if (isUpstashRedisConfigured()) return "upstash";
  if (isCloudflareStateConfigured()) return "cloudflare-do";
  return "memory";
}

export function isRedisConfigured(): boolean {
  return redisBackendKind() !== "memory";
}

function kvShardFor(key: string): string {
  const parts = key.split(":").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "tg" && parts[1] === "upd") {
    return `kv:tg:${parts[2]}`;
  }
  return `kv:${parts.slice(0, 2).join(":") || "default"}`;
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
  if (isUpstashRedisConfigured()) return cmd<string>(["GET", key]);
  const stub = getCloudflareStateStub(kvShardFor(key));
  if (stub) {
    try {
      return await stub.kvGet(key);
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare DO kvGet failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { mem.delete(key); return null; }
  return hit.value;
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (isUpstashRedisConfigured()) {
    await cmd(["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds))]);
    return;
  }
  const stub = getCloudflareStateStub(kvShardFor(key));
  if (stub) {
    try {
      await stub.kvSet(key, value, ttlSeconds);
      return;
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare DO kvSet failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Sets a key only if absent (NX). Returns true if set (first caller wins), false if it already existed. */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (isUpstashRedisConfigured()) {
    const res = await cmd<string | null>(["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds)), "NX"]);
    return res === "OK";
  }
  const stub = getCloudflareStateStub(kvShardFor(key));
  if (stub) {
    try {
      return await stub.kvSetNx(key, value, ttlSeconds);
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare DO kvSetNx failed: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  const hit = mem.get(key);
  if (hit && Date.now() <= hit.expiresAt) return false;
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

export async function redisDel(key: string): Promise<void> {
  mem.delete(key);
  if (isUpstashRedisConfigured()) {
    await cmd(["DEL", key]);
    return;
  }
  const stub = getCloudflareStateStub(kvShardFor(key));
  if (stub) {
    try {
      await stub.kvDel(key);
    } catch { /* best effort */ }
  }
}

export async function redisPing(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const t = Date.now();
  if (isUpstashRedisConfigured()) {
    const pong = await cmd<string>(["PING"]);
    return {
      ok: pong === "PONG",
      detail: pong === "PONG" ? "PONG · Upstash Redis REST connected" : "Ping failed",
      latencyMs: Date.now() - t,
    };
  }
  const stub = getCloudflareStateStub("kv:health");
  if (stub) {
    try {
      const res = await stub.ping();
      return {
        ok: Boolean(res?.ok),
        detail: res?.ok ? "PONG · Cloudflare Durable Object SQLite (edge cache & rate limit)" : "DO health check failed",
        latencyMs: Date.now() - t,
      };
    } catch (e) {
      return {
        ok: false,
        detail: `Cloudflare DO error: ${e instanceof Error ? e.message : "unreachable"}`,
        latencyMs: Date.now() - t,
      };
    }
  }
  return {
    ok: false,
    detail: "In-memory fallback active (Cloudflare Durable Object on edge, or set UPSTASH_REDIS_REST_* locally)",
    latencyMs: 0,
  };
}
