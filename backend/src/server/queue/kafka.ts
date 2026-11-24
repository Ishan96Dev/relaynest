import "server-only";
import { kafkaEnv } from "@backend/lib/env/streaming";
import { logEvent } from "@backend/server/logger";

export type KafkaTopicKey = "telegram.updates" | "workflows.execute" | "audit.events" | "notifications.dispatch";

export function isKafkaConfigured(): boolean {
  const e = kafkaEnv();
  return Boolean(e.url && e.username && e.password);
}

function authHeader(): string {
  const { username, password } = kafkaEnv();
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function fullTopic(topic: KafkaTopicKey): string {
  return `${kafkaEnv().topicPrefix}.${topic}`;
}

/**
 * Publishes an event to Kafka over HTTPS REST (Upstash Kafka REST compatible, runs on Cloudflare Workers and Node).
 * Never throws: if Kafka is unconfigured or temporarily down, logs and lets the caller continue safely.
 */
export async function publishKafkaEvent(topic: KafkaTopicKey, payload: Record<string, unknown>, key?: string): Promise<boolean> {
  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) return false;
  const topicName = fullTopic(topic);
  try {
    const res = await fetch(`${env.url}/produce/${encodeURIComponent(topicName)}`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify({ ...payload, ts: new Date().toISOString() }), ...(key ? { key } : {}) }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      logEvent("queue", "warn", `Kafka produce failed (${res.status}) on ${topicName}`);
      return false;
    }
    logEvent("queue", "info", `Kafka produced -> ${topicName}`, key ? { key } : undefined);
    return true;
  } catch (e) {
    logEvent("queue", "warn", `Kafka unreachable: ${e instanceof Error ? e.message : "network"}`);
    return false;
  }
}

export interface KafkaRecord {
  topic: string;
  partition: number;
  offset: number;
  key?: string;
  value: string;
}

/** Pulls pending records from a Kafka consumer group (called by `/api/queues/kafka` cron/worker). */
export async function consumeKafkaTopic(topic: KafkaTopicKey, group = "relaynest-workers", instance = "worker-1"): Promise<KafkaRecord[]> {
  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) return [];
  const topicName = fullTopic(topic);
  try {
    const res = await fetch(`${env.url}/consume/${encodeURIComponent(group)}/${encodeURIComponent(instance)}/${encodeURIComponent(topicName)}`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/json" },
      body: JSON.stringify({ timeout: 1000 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as KafkaRecord[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function kafkaPing(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const t = Date.now();
  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) return { ok: false, detail: "Not set (optional: set UPSTASH_KAFKA_REST_* for event streaming)", latencyMs: 0 };
  try {
    const res = await fetch(`${env.url}/topics`, { headers: { authorization: authHeader() }, signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, detail: res.ok ? `Connected · prefix "${env.topicPrefix}"` : `HTTP ${res.status}`, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Unreachable", latencyMs: Date.now() - t };
  }
}
