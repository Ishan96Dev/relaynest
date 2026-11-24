import "server-only";

const read = (k: string) => process.env[k]?.trim() || undefined;

/** Upstash / HTTP Redis REST configuration (works on both Node and Cloudflare Workers). */
export function redisEnv() {
  return {
    url: (read("UPSTASH_REDIS_REST_URL") || read("REDIS_REST_URL"))?.replace(/\/+$/, ""),
    token: read("UPSTASH_REDIS_REST_TOKEN") || read("REDIS_REST_TOKEN"),
  };
}

/** Upstash / HTTP Kafka REST configuration (works on both Node and Cloudflare Workers). */
export function kafkaEnv() {
  return {
    url: (read("UPSTASH_KAFKA_REST_URL") || read("KAFKA_REST_URL"))?.replace(/\/+$/, ""),
    username: read("UPSTASH_KAFKA_REST_USERNAME") || read("KAFKA_REST_USERNAME"),
    password: read("UPSTASH_KAFKA_REST_PASSWORD") || read("KAFKA_REST_PASSWORD"),
    topicPrefix: read("KAFKA_TOPIC_PREFIX") || "relaynest",
    consumerSecret: read("KAFKA_CONSUMER_SECRET") || read("CRON_SECRET"),
  };
}
