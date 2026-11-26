import "server-only";
import { logEvent } from "@backend/server/logger";
import type { QueueEventEnvelope } from "@backend/server/queue/kafka";
import { loadToken, markBotDeletedOnTelegram } from "@backend/server/services/bots";
import { runWorkflow, type TriggerKind } from "@backend/server/services/workflow-runner";
import {
  getTelegramRetryAfterSec,
  isTelegramBotDeletedError,
  isTelegramRateLimitError,
  sendFormattedMessage,
  sendMessage,
} from "@backend/server/telegram/client";
import {
  recordTelegramCooldown,
  reserveTelegramSendSlot,
  type OutboundTelegramJob,
} from "@backend/server/telegram/outbound";

export interface QueueConsumerOutcome {
  action: "ack" | "retry";
  delaySeconds?: number;
  reason?: string;
}

/**
 * Processes one message delivered by Cloudflare Queues (`relaynest-events`).
 * Returns `{ action: "ack" }` on completion or permanent failure, and `{ action: "retry", delaySeconds }`
 * when Telegram pacing/cooldown or transient upstream errors require backoff.
 */
export async function processQueueEnvelope(
  envelope: QueueEventEnvelope,
  attempts = 1,
): Promise<QueueConsumerOutcome> {
  if (!envelope || typeof envelope !== "object" || typeof envelope.topic !== "string") {
    return { action: "ack", reason: "malformed_envelope" };
  }

  if (envelope.topic === "telegram.outbound") {
    const job = envelope.payload as unknown as OutboundTelegramJob;
    if (!job?.botId || !job?.workspaceId || !job?.chatId) {
      return { action: "ack", reason: "invalid_telegram_job" };
    }

    const slot = await reserveTelegramSendSlot(job.botId, job.chatId, {
      isGroup: job.isGroup,
      maxImmediateWaitMs: 600,
    });
    if (!slot.allowed) {
      const delaySeconds = Math.max(1, Math.ceil(slot.delayMs / 1000));
      logEvent("queue", "info", `Queue consumer deferring Telegram job (${slot.reason ?? "paced"}, +${delaySeconds}s)`, {
        botId: job.botId,
        chatId: job.chatId,
        attempts,
      });
      return { action: "retry", delaySeconds, reason: slot.reason ?? "paced" };
    }
    if (slot.delayMs > 0) {
      await new Promise((r) => setTimeout(r, slot.delayMs));
    }

    let token: string;
    try {
      token = await loadToken(job.botId, job.workspaceId);
    } catch {
      // Bot or credentials removed since enqueue — permanent failure, acknowledge cleanly.
      return { action: "ack", reason: "bot_credentials_missing" };
    }

    try {
      if (job.kind === "formatted") {
        await sendFormattedMessage(
          token,
          job.chatId,
          job.html ?? job.plainFallback ?? "",
          job.plainFallback ?? job.html ?? "",
          {
            linkPreviewUrl: job.linkPreviewUrl,
            preferLargeMedia: job.preferLargeMedia,
          },
        );
      } else {
        await sendMessage(token, job.chatId, job.text ?? "");
      }
      logEvent("queue", "info", `Queue consumer delivered Telegram message`, {
        botId: job.botId,
        chatId: job.chatId,
        attempts,
      });
      return { action: "ack", reason: "delivered" };
    } catch (err) {
      if (isTelegramBotDeletedError(err)) {
        await markBotDeletedOnTelegram(job.botId, job.workspaceId).catch(() => undefined);
        return { action: "ack", reason: "telegram_bot_deleted" };
      }
      if (isTelegramRateLimitError(err)) {
        const retryAfterSec = getTelegramRetryAfterSec(err) ?? 5;
        await recordTelegramCooldown(job.botId, job.chatId, retryAfterSec);
        logEvent("queue", "warn", `Queue consumer hit Telegram 429; retrying in ${retryAfterSec + 1}s`, {
          botId: job.botId,
          chatId: job.chatId,
          attempts,
        });
        return { action: "retry", delaySeconds: retryAfterSec + 1, reason: "telegram_429" };
      }
      const backoff = Math.min(60, 2 ** Math.min(Math.max(attempts, 1), 5));
      logEvent("queue", "warn", `Queue consumer transient Telegram error: ${err instanceof Error ? err.message : "unknown"}`, {
        botId: job.botId,
        attempts,
        backoff,
      });
      return { action: "retry", delaySeconds: backoff, reason: "transient_error" };
    }
  }

  if (envelope.topic === "workflows.execute") {
    const p = envelope.payload as {
      workflowId?: string;
      trigger?: TriggerKind;
      payload?: Record<string, unknown>;
      idempotencyKey?: string;
    };
    if (!p?.workflowId) return { action: "ack", reason: "invalid_workflow_job" };
    await runWorkflow({
      workflowId: p.workflowId,
      trigger: p.trigger ?? "telegram",
      payload: p.payload ?? {},
      idempotencyKey: p.idempotencyKey,
    });
    return { action: "ack", reason: "workflow_ran" };
  }

  // Telemetry / audit / update events are acknowledged cleanly.
  logEvent("queue", "info", `Queue consumer processed ${envelope.topic}`, envelope.key ? { key: envelope.key } : undefined);
  return { action: "ack", reason: "event_processed" };
}
