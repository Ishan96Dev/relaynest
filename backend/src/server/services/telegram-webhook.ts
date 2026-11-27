import "server-only";
import { sha256Hex, safeEqual } from "@backend/lib/crypto";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { executionAllowed } from "@backend/server/billing/entitlements";
import { redisSetNx } from "@backend/server/cache/redis";
import { isCloudflareQueueConfigured } from "@backend/server/cloudflare/bindings";
import { publishKafkaEvent } from "@backend/server/queue/kafka";
import { triggerTelegramWorkflows } from "@backend/server/services/telegram-triggers";
import { withUsageScope } from "@backend/server/ai/usage";
import { handleAgentUpdate } from "@backend/server/services/ai-agent-runtime";
import { formatTelegramHtmlReply, formatTelegramPlainReply, type CitationSource } from "@backend/server/ai/citations";
import { loadToken, markBotDeletedOnTelegram } from "@backend/server/services/bots";
import {
  buildTelegramTriggerPayload,
  ExecutionTracer,
  finishExecutionRecord,
  safeErrorMessage,
  startExecutionRecord,
} from "@backend/server/services/execution-trace";
import { answerFromKnowledge } from "@backend/server/services/knowledge-retrieval";
import { isTelegramBotDeletedError, isTelegramRateLimitError, type TelegramUpdate } from "@backend/server/telegram/client";
import { dispatchTelegramMessage } from "@backend/server/telegram/outbound";

export type WebhookOutcome = "ok" | "unauthorized" | "not_found" | "duplicate" | "ignored";

/**
 * Authenticates, deduplicates, then returns a handler to run after the response is sent.
 * Telegram expects a fast 200; replies are sent from the deferred step.
 */
export async function receiveTelegramUpdate(publicId: string, secretHeader: string | null, update: TelegramUpdate) {
  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("id, workspace_id, status, webhook_secret_hash, welcome_message, default_response, telegram_username")
    .eq("public_id", publicId)
    .maybeSingle();

  // Same response for unknown bot and bad secret so bot existence is not revealed.
  if (!bot || !bot.webhook_secret_hash || !secretHeader) return { outcome: "unauthorized" as const };
  if (!safeEqual(await sha256Hex(secretHeader), bot.webhook_secret_hash as string)) return { outcome: "unauthorized" as const };
  if (bot.status !== "active") return { outcome: "ignored" as const };

  if (!(await redisSetNx(`tg:upd:${bot.id}:${update.update_id}`, "1", 3600))) {
    return { outcome: "duplicate" as const };
  }
  const { error } = await admin.from("processed_events").insert({
    workspace_id: bot.workspace_id,
    source: `telegram:${bot.id}`,
    external_event_id: String(update.update_id),
  });
  if (error) return { outcome: error.code === "23505" ? ("duplicate" as const) : ("ignored" as const) };

  const botRow: TelegramBotRow = {
    id: bot.id as string,
    workspace_id: bot.workspace_id as string,
    welcome_message: (bot.welcome_message as string | null) ?? null,
    default_response: (bot.default_response as string | null) ?? null,
    telegram_username: (bot.telegram_username as string | null) ?? null,
  };

  // On Cloudflare Workers, `after()` runs inside `ctx.waitUntil()` which Cloudflare hard-cancels at 30s.
  // Offload execution onto Cloudflare Queues (up to 15 min wall-clock) so /imagine, /search, and /describe never get silently cut off.
  if (isCloudflareQueueConfigured()) {
    const queued = await publishKafkaEvent(
      "telegram.updates",
      {
        botId: botRow.id,
        workspaceId: botRow.workspace_id,
        updateId: update.update_id,
        execute: true,
        bot: botRow,
        update,
      },
      botRow.id,
    );
    if (queued) {
      return {
        outcome: "ok" as const,
        queued: true as const,
      };
    }
  }

  void publishKafkaEvent(
    "telegram.updates",
    { botId: botRow.id, workspaceId: botRow.workspace_id, updateId: update.update_id },
    botRow.id,
  );
  return {
    outcome: "ok" as const,
    queued: false as const,
    process: () => processTelegramUpdate(botRow, update),
  };
}

/**
 * Handles an update fetched by the local polling loop. There is no webhook secret to check because the update came from
 * Telegram over our own authenticated request. Only bots activated in polling mode are accepted, and updates are
 * deduplicated the same way as webhook deliveries (Telegram can resend an update after a restart).
 */
export async function processPolledUpdate(botId: string, update: TelegramUpdate): Promise<WebhookOutcome> {
  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("id, workspace_id, status, webhook_status, welcome_message, default_response, telegram_username")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.status !== "active" || bot.webhook_status !== "polling") return "ignored";
  const { error } = await admin.from("processed_events").insert({
    workspace_id: bot.workspace_id,
    source: `telegram:${bot.id}`,
    external_event_id: String(update.update_id),
  });
  if (error) return error.code === "23505" ? "duplicate" : "ignored";
  await processTelegramUpdate(bot as TelegramBotRow, update);
  return "ok";
}

export interface TelegramBotRow {
  id: string;
  workspace_id: string;
  welcome_message: string | null;
  default_response: string | null;
  telegram_username: string | null;
}

/** Executes one deduplicated Telegram update (used by Cloudflare Queue consumer, webhook `after()`, and local polling). */
export function processTelegramUpdate(bot: TelegramBotRow, update: TelegramUpdate): Promise<void> {
  return withUsageScope({ workspaceId: bot.workspace_id, origin: "agent", botId: bot.id }, () => processUpdateInner(bot, update));
}
async function processUpdateInner(bot: TelegramBotRow, update: TelegramUpdate) {
  // Plan quota: a workspace past its monthly executions stops being answered until the month turns over or it upgrades.
  if (!(await executionAllowed(bot.workspace_id))) {
    if (update.message?.chat?.id) {
      await dispatchTelegramMessage({
        botId: bot.id,
        workspaceId: bot.workspace_id,
        token: await loadToken(bot.id, bot.workspace_id),
        chatId: String(update.message.chat.id),
        kind: "text",
        text: "This bot has reached its monthly plan execution limit. Upgrade the workspace plan in RelayNest to resume replies.",
        isGroup: update.message.chat.type !== "private",
      }).catch(() => undefined);
    }
    return;
  }
  // Run published automations in parallel so they never add latency to the bot's reply.
  const wfPromise = triggerTelegramWorkflows(bot, update).catch(() => undefined);
  // Bots created from an AI agent answer with the agent; every other bot uses commands and keyword rules.
  if (await handleAgentUpdate(bot, update)) {
    await wfPromise;
    return;
  }
  const msg = update.message;
  if (!msg?.text) { await wfPromise; return; }
  const admin = createAdminClient();
  const text = msg.text.trim();
  const started = Date.now();
  const tracer = new ExecutionTracer({ startedMs: started });
  let reply: string | null = null;
  let replySources: CitationSource[] = [];
  let trigger = "message";

  const cmd = /^\/([a-zA-Z0-9_]{1,32})(?:@\w+)?(?:\s|$)/.exec(text)?.[1]?.toLowerCase();
  if (cmd) trigger = `command:/${cmd}`;

  const idempotencyKey = `tg:${bot.id}:${update.update_id}`;
  const triggerPayload = buildTelegramTriggerPayload(update, {
    botUsername: bot.telegram_username,
    command: cmd ? `/${cmd}` : null,
    commandInput: cmd ? text.replace(/^\/\S+\s*/, "").trim() : text,
    kind: cmd ? "command" : "message",
  });

  tracer.record("telegram_received", "telegram.received", {
    startedMs: started,
    finishedMs: Date.now(),
    inputSummary: {
      command: cmd ? `/${cmd}` : undefined,
      text,
      chatId: String(msg.chat.id),
      chatType: msg.chat.type,
      fromUsername: msg.from?.username,
      fromFirstName: msg.from?.first_name,
      updateId: update.update_id,
      messageId: msg.message_id,
    },
    outputSummary: { botUsername: bot.telegram_username ?? undefined },
  });

  const executionId = await startExecutionRecord({
    workspaceId: bot.workspace_id,
    botId: bot.id,
    triggerType: trigger,
    idempotencyKey,
    startedMs: started,
    triggerPayload,
  });

  let status: "succeeded" | "failed" = "succeeded";
  let errorCode: string | null = null;
  let errorMessageSafe: string | null = null;

  await withUsageScope(
    { workspaceId: bot.workspace_id, origin: "agent", botId: bot.id, executionId: executionId ?? undefined },
    async () => {
      if (cmd) {
        trigger = `command:/${cmd}`;
        const { data } = await tracer.trace(
          "match_command",
          "rule.matched",
          { ruleType: "command", command: `/${cmd}` },
          async () =>
            admin
              .from("bot_commands")
              .select("response_config")
              .eq("bot_id", bot.id)
              .eq("command", cmd)
              .eq("enabled", true)
              .maybeSingle(),
          (res) => ({
            ruleType: "command",
            matchedValue: `/${cmd}`,
            configured: Boolean((res.data?.response_config as { text?: string } | null)?.text),
          }),
        );
        reply = ((data?.response_config as { text?: string } | null)?.text) ?? null;
        if (!reply && cmd === "start") reply = bot.welcome_message ?? "Welcome!";
        if (!reply && cmd === "help") reply = "Use the commands in the menu to interact with this bot.";
      } else {
        const { data: rules } = await admin
          .from("bot_responses")
          .select("match_type, match_value, response_text")
          .eq("bot_id", bot.id)
          .eq("enabled", true)
          .order("priority", { ascending: true });
        const hit = rules?.find((r) => r.match_type === "keyword" && r.match_value && text.toLowerCase().includes(String(r.match_value).toLowerCase()));
        reply = (hit?.response_text as string | undefined) ?? null;
        trigger = hit ? "keyword" : "default";
        if (hit) {
          tracer.record("match_keyword", "rule.matched", {
            inputSummary: { ruleType: "keyword", text: text.slice(0, 200) },
            outputSummary: { ruleType: "keyword", matchedValue: String(hit.match_value) },
          });
        }
        // No rule matched: answer from Knowledge Base collections shared with this bot, then fall back to the default response.
        if (!reply) {
          const kb = await tracer.trace(
            "knowledge_lookup",
            "knowledge.retrieve",
            { query: text.slice(0, 300) },
            () => answerFromKnowledge(bot.id, bot.workspace_id, text),
            (res) => ({
              matched: Boolean(res),
              sourceCount: res?.sources.length ?? 0,
              outputPreview: res?.text.slice(0, 500),
            }),
          );
          if (kb) {
            reply = kb.text;
            replySources = kb.sources;
            trigger = "knowledge";
          }
        }
        if (!reply) {
          reply = bot.default_response;
          tracer.record("default_fallback", "rule.matched", {
            inputSummary: { ruleType: "default" },
            outputSummary: { ruleType: "default", hasDefaultResponse: Boolean(reply) },
          });
        }
      }

      if (reply) {
        try {
          const tok = await loadToken(bot.id, bot.workspace_id);
          const replyText = reply;
          await tracer.trace(
            "telegram_send_reply",
            "telegram.send_message",
            { chatId: String(msg.chat.id), format: replySources.length > 0 ? "html" : "text", citations: replySources.length },
            () =>
              replySources.length > 0
                ? dispatchTelegramMessage({
                    botId: bot.id,
                    workspaceId: bot.workspace_id,
                    token: tok,
                    chatId: String(msg.chat.id),
                    kind: "formatted",
                    html: formatTelegramHtmlReply(replyText, replySources),
                    plainFallback: formatTelegramPlainReply(replyText, replySources),
                    isGroup: msg.chat.type !== "private",
                    idempotencyKey,
                  })
                : dispatchTelegramMessage({
                    botId: bot.id,
                    workspaceId: bot.workspace_id,
                    token: tok,
                    chatId: String(msg.chat.id),
                    kind: "text",
                    text: replyText,
                    isGroup: msg.chat.type !== "private",
                    idempotencyKey,
                  }),
            (res) => ({
              delivered: res.delivered,
              queued: res.queued,
              messageId: res.messageId,
              chunks: 1,
              replyPreview: replyText.slice(0, 600),
            }),
          );
        } catch (err) {
          status = "failed";
          errorCode = isTelegramBotDeletedError(err)
            ? "TELEGRAM_BOT_DELETED"
            : isTelegramRateLimitError(err)
              ? "TELEGRAM_RATE_LIMITED"
              : "SEND_FAILED";
          errorMessageSafe = safeErrorMessage(err, "Failed to deliver Telegram reply.");
          if (isTelegramBotDeletedError(err)) void markBotDeletedOnTelegram(bot.id, bot.workspace_id);
        }
      }
    },
  );

  await Promise.allSettled([
    wfPromise,
    finishExecutionRecord({
      executionId,
      workspaceId: bot.workspace_id,
      botId: bot.id,
      triggerType: trigger,
      status,
      startedMs: started,
      errorCode,
      errorMessageSafe,
      idempotencyKey,
      triggerPayload,
      tracer,
      incrementMessages: true,
    }),
  ]);
}
