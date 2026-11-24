import { ok, route } from "@backend/lib/http/api";
import { safeEqual } from "@backend/lib/crypto";
import { kafkaEnv } from "@backend/lib/env/streaming";
import { consumeKafkaTopic } from "@backend/server/queue/kafka";
import { runWorkflow } from "@backend/server/services/workflow-runner";

export const dynamic = "force-dynamic";

/**
 * Drains pending workflow execution messages from Kafka (`relaynest.workflows.execute`).
 * Protected by KAFKA_CONSUMER_SECRET (or CRON_SECRET). Call periodically via Cloudflare Cron or an Upstash webhook.
 */
async function handle(req: Request, _ctx: unknown, requestId: string) {
  const secret = kafkaEnv().consumerSecret;
  const given = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || !given || !safeEqual(given, secret)) return new Response(null, { status: 401 });

  const records = await consumeKafkaTopic("workflows.execute");
  let processed = 0;
  for (const r of records) {
    try {
      const msg = JSON.parse(r.value) as { workflowId?: string; trigger?: "schedule" | "webhook" | "telegram" | "manual"; payload?: Record<string, unknown>; idempotencyKey?: string };
      if (msg.workflowId) {
        await runWorkflow({ workflowId: msg.workflowId, trigger: msg.trigger ?? "schedule", payload: msg.payload ?? {}, idempotencyKey: msg.idempotencyKey });
        processed++;
      }
    } catch {
      // Skip malformed event.
    }
  }
  return ok({ pulled: records.length, processed }, {}, 200, requestId);
}

export const GET = route(handle);
export const POST = route(handle);
