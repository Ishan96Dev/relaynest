import "server-only";
import { kafkaEnv } from "@backend/lib/env/streaming";
import { getCloudflareQueue, isCloudflareQueueConfigured } from "@backend/server/cloudflare/bindings";
import { logEvent } from "@backend/server/logger";

export type KafkaTopicKey =
  | "telegram.updates"
  | "telegram.outbound"
  | "workflows.execute"
  | "audit.events"
  | "notifications.dispatch";

export interface QueueEventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  topic: KafkaTopicKey;
  payload: T;
  key?: string;
  ts: string;
}

export type QueueBackendKind = "cloudflare-queues" | "kafka-rest" | "none";

export function isExternalKafkaConfigured(): boolean {
  const e = kafkaEnv();
  return Boolean(e.url && e.username && e.password);
}

export function queueBackendKind(): QueueBackendKind {
  if (isCloudflareQueueConfigured()) return "cloudflare-queues";
  if (isExternalKafkaConfigured()) return "kafka-rest";
  return "none";
}

export function isKafkaConfigured(): boolean {
  return queueBackendKind() !== "none";
}

function authHeader(): string {
  const { username, password } = kafkaEnv();
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function fullTopic(topic: KafkaTopicKey): string {
  return `${kafkaEnv().topicPrefix}.${topic}`;
}

function shouldUseRestV2(url: string, mode: "auto" | "rest-v2" | "legacy"): boolean {
  if (mode === "rest-v2") return true;
  if (mode === "legacy") return false;
  // Auto-detect standard Confluent / Aiven Karapace REST Proxy endpoints vs legacy Upstash REST paths.
  return !url.includes(".upstash.io");
}

/**
 * Publishes an event to the active durable queue/bus:
 * 1. Cloudflare Queues (`RELAYNEST_QUEUE` -> `relaynest-events`) natively on Cloudflare Workers (supports `delaySeconds`).
 * 2. External Kafka HTTP REST (Aiven Karapace / Confluent Kafka REST v2 or legacy REST) when `KAFKA_REST_*` env vars are set.
 * Never throws: if unconfigured or temporarily down, logs and returns `false`.
 */
export async function publishKafkaEvent(
  topic: KafkaTopicKey,
  payload: Record<string, unknown>,
  key?: string,
  opts?: { delaySeconds?: number },
): Promise<boolean> {
  const ts = new Date().toISOString();
  const cfQueue = getCloudflareQueue();
  if (cfQueue) {
    try {
      const envelope: QueueEventEnvelope = { topic, payload, ...(key ? { key } : {}), ts };
      const delaySeconds =
        typeof opts?.delaySeconds === "number" && opts.delaySeconds > 0
          ? Math.min(Math.ceil(opts.delaySeconds), 43_200)
          : undefined;
      await cfQueue.send(envelope, delaySeconds ? { delaySeconds } : undefined);
      logEvent("queue", "info", `Cloudflare Queue enqueued -> ${topic}`, {
        ...(key ? { key } : {}),
        ...(delaySeconds ? { delaySeconds } : {}),
      });
      return true;
    } catch (e) {
      logEvent("queue", "warn", `Cloudflare Queue send failed on ${topic}: ${e instanceof Error ? e.message : "error"}`);
      return false;
    }
  }

  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) return false;
  const topicName = fullTopic(topic);
  const useV2 = shouldUseRestV2(env.url, env.mode);

  try {
    const res = useV2
      ? await fetch(`${env.url}/topics/${encodeURIComponent(topicName)}`, {
          method: "POST",
          headers: {
            authorization: authHeader(),
            "content-type": "application/vnd.kafka.json.v2+json",
            accept: "application/vnd.kafka.v2+json",
          },
          body: JSON.stringify({
            records: [{ ...(key ? { key } : {}), value: { ...payload, ts } }],
          }),
          signal: AbortSignal.timeout(4000),
        })
      : await fetch(`${env.url}/produce/${encodeURIComponent(topicName)}`, {
          method: "POST",
          headers: { authorization: authHeader(), "content-type": "application/json" },
          body: JSON.stringify({ value: JSON.stringify({ ...payload, ts }), ...(key ? { key } : {}) }),
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

/** Pulls pending records from an external Kafka REST consumer group (called by `/api/queues/kafka`). */
export async function consumeKafkaTopic(topic: KafkaTopicKey, group = "relaynest-workers", instance = "worker-1"): Promise<KafkaRecord[]> {
  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) return [];
  const topicName = fullTopic(topic);
  const useV2 = shouldUseRestV2(env.url, env.mode);

  try {
    if (useV2) {
      // Standard Kafka REST Proxy v2 (Aiven Karapace / Confluent) consumer instance pull.
      const base = `${env.url}/consumers/${encodeURIComponent(group)}/instances/${encodeURIComponent(instance)}`;
      await fetch(`${env.url}/consumers/${encodeURIComponent(group)}`, {
        method: "POST",
        headers: { authorization: authHeader(), "content-type": "application/vnd.kafka.v2+json" },
        body: JSON.stringify({ name: instance, format: "json", "auto.offset.reset": "earliest" }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
      await fetch(`${base}/subscription`, {
        method: "POST",
        headers: { authorization: authHeader(), "content-type": "application/vnd.kafka.v2+json" },
        body: JSON.stringify({ topics: [topicName] }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
      const res = await fetch(`${base}/records?timeout=1000&max_bytes=262144`, {
        method: "GET",
        headers: { authorization: authHeader(), accept: "application/vnd.kafka.json.v2+json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{ topic: string; partition: number; offset: number; key?: unknown; value: unknown }>;
      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        topic: r.topic,
        partition: r.partition,
        offset: r.offset,
        key: r.key !== undefined && r.key !== null ? String(r.key) : undefined,
        value: typeof r.value === "string" ? r.value : JSON.stringify(r.value),
      }));
    }

    const res = await fetch(
      `${env.url}/consume/${encodeURIComponent(group)}/${encodeURIComponent(instance)}/${encodeURIComponent(topicName)}`,
      {
        method: "POST",
        headers: { authorization: authHeader(), "content-type": "application/json" },
        body: JSON.stringify({ timeout: 1000 }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as KafkaRecord[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function kafkaPing(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const t = Date.now();
  if (isCloudflareQueueConfigured()) {
    return {
      ok: true,
      detail: "Connected · Cloudflare Queues (relaynest-events + DLQ)",
      latencyMs: Math.max(1, Date.now() - t),
    };
  }
  const env = kafkaEnv();
  if (!env.url || !env.username || !env.password) {
    return {
      ok: false,
      detail: "Not set (Cloudflare Queues active on edge; optional: set KAFKA_REST_* for external Kafka REST v2)",
      latencyMs: 0,
    };
  }
  try {
    const res = await fetch(`${env.url}/topics`, {
      headers: { authorization: authHeader() },
      signal: AbortSignal.timeout(5000),
    });
    return {
      ok: res.ok,
      detail: res.ok ? `Connected · Kafka REST · prefix "${env.topicPrefix}"` : `HTTP ${res.status}`,
      latencyMs: Date.now() - t,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Unreachable", latencyMs: Date.now() - t };
  }
}
