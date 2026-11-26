import "server-only";

const read = (k: string) => process.env[k]?.trim() || undefined;

/** Upstash / HTTP Redis REST configuration (optional: Cloudflare Workers uses Durable Object SQLite automatically). */
export function redisEnv() {
  return {
    url: (read("UPSTASH_REDIS_REST_URL") || read("REDIS_REST_URL"))?.replace(/\/+$/, ""),
    token: read("UPSTASH_REDIS_REST_TOKEN") || read("REDIS_REST_TOKEN"),
  };
}

export type KafkaRestMode = "auto" | "rest-v2" | "legacy";

/**
 * External Kafka HTTP REST configuration (optional: Cloudflare Workers uses Cloudflare Queues natively).
 * Supports standard Confluent / Aiven Karapace Kafka REST v2 (`/topics/{topic}`) and legacy `/produce/{topic}` endpoints.
 */
export function kafkaEnv() {
  const rawMode = (read("KAFKA_REST_MODE") || "auto").toLowerCase();
  const mode: KafkaRestMode = rawMode === "rest-v2" || rawMode === "legacy" ? rawMode : "auto";
  return {
    url: (read("KAFKA_REST_URL") || read("UPSTASH_KAFKA_REST_URL"))?.replace(/\/+$/, ""),
    username: read("KAFKA_REST_USERNAME") || read("UPSTASH_KAFKA_REST_USERNAME"),
    password: read("KAFKA_REST_PASSWORD") || read("UPSTASH_KAFKA_REST_PASSWORD"),
    topicPrefix: read("KAFKA_TOPIC_PREFIX") || "relaynest",
    consumerSecret: read("KAFKA_CONSUMER_SECRET") || read("CRON_SECRET"),
    mode,
  };
}
