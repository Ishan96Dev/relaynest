import { ok, route } from "@backend/lib/http/api";
import { safeEqual } from "@backend/lib/crypto";
import { kafkaEnv } from "@backend/lib/env/streaming";
import { processQueueEnvelope } from "@backend/server/queue/consumer";
import type { QueueEventEnvelope } from "@backend/server/queue/kafka";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Internal Cloudflare Queue consumer endpoint invoked by `cloudflare/worker.ts`'s `queue()` handler.
 * Protected by timing-safe Bearer authentication (`KAFKA_CONSUMER_SECRET` or `CRON_SECRET`).
 */
async function handle(req: Request, _ctx: unknown, requestId: string) {
  const secret = kafkaEnv().consumerSecret;
  const given = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || !given || !safeEqual(given, secret)) {
    return new Response(null, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    attempts?: number;
    body?: QueueEventEnvelope;
  } | null;

  if (!body?.body) {
    return ok({ action: "ack", reason: "empty_body" }, {}, 200, requestId);
  }

  const outcome = await processQueueEnvelope(body.body, Number(body.attempts ?? 1));
  return ok(outcome, {}, 200, requestId);
}

export const POST = route(handle);
