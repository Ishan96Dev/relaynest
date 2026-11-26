import "server-only";
import { sha256Hex, safeEqual } from "@backend/lib/crypto";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { executionAllowed } from "@backend/server/billing/entitlements";
import { redisSetNx } from "@backend/server/cache/redis";
import { publishKafkaEvent } from "@backend/server/queue/kafka";
import { triggerTelegramWorkflows } from "@backend/server/services/telegram-triggers";
import { withUsageScope } from "@backend/server/ai/usage";
import { handleAgentUpdate } from "@backend/server/services/ai-agent-runtime";
import { formatTelegramHtmlReply, formatTelegramPlainReply, type CitationSource } from "@backend/server/ai/citations";
import { loadToken, markBotDeletedOnTelegram } from "@backend/server/services/bots";
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

  void publishKafkaEvent("telegram.updates", { botId: bot.id, workspaceId: bot.workspace_id, updateId: update.update_id }, bot.id);
  return {
    outcome: "ok" as const,
    process: () => processUpdate(bot as BotRow, update),
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
  await processUpdate(bot as BotRow, update);
  return "ok";
}

interface BotRow { id: string; workspace_id: string; welcome_message: string | null; default_response: string | null; telegram_username: string | null }

function processUpdate(bot: BotRow, update: TelegramUpdate): Promise<void> {
  return withUsageScope({ workspaceId: bot.workspace_id, origin: "agent" }, () => processUpdateInner(bot, update));
}
async function processUpdateInner(bot: BotRow, update: TelegramUpdate) {
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
  let reply: string | null = null;
  let replySources: CitationSource[] = [];
  let trigger = "message";

  const cmd = /^\/([a-zA-Z0-9_]{1,32})(?:@\w+)?(?:\s|$)/.exec(text)?.[1]?.toLowerCase();
  if (cmd) {
    trigger = `command:/${cmd}`;
    const { data } = await admin
      .from("bot_commands")
      .select("response_config")
      .eq("bot_id", bot.id)
      .eq("command", cmd)
      .eq("enabled", true)
      .maybeSingle();
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
    // No rule matched: answer from Knowledge Base collections shared with this bot, then fall back to the default response.
    if (!reply) {
      const kb = await answerFromKnowledge(bot.id, bot.workspace_id, text);
      if (kb) {
        reply = kb.text;
        replySources = kb.sources;
        trigger = "knowledge";
      }
    }
    if (!reply) reply = bot.default_response;
  }

  let status: "succeeded" | "failed" = "succeeded";
  let errorCode: string | null = null;
  if (reply) {
    try {
      const tok = await loadToken(bot.id, bot.workspace_id);
      if (replySources.length > 0) {
        await dispatchTelegramMessage({
          botId: bot.id,
          workspaceId: bot.workspace_id,
          token: tok,
          chatId: String(msg.chat.id),
          kind: "formatted",
          html: formatTelegramHtmlReply(reply, replySources),
          plainFallback: formatTelegramPlainReply(reply, replySources),
          isGroup: msg.chat.type !== "private",
          idempotencyKey: `tg:${bot.id}:${update.update_id}`,
        });
      } else {
        await dispatchTelegramMessage({
          botId: bot.id,
          workspaceId: bot.workspace_id,
          token: tok,
          chatId: String(msg.chat.id),
          kind: "text",
          text: reply,
          isGroup: msg.chat.type !== "private",
          idempotencyKey: `tg:${bot.id}:${update.update_id}`,
        });
      }
    } catch (err) {
      status = "failed";
      errorCode = isTelegramBotDeletedError(err)
        ? "TELEGRAM_BOT_DELETED"
        : isTelegramRateLimitError(err)
          ? "TELEGRAM_RATE_LIMITED"
          : "SEND_FAILED";
      if (isTelegramBotDeletedError(err)) void markBotDeletedOnTelegram(bot.id, bot.workspace_id);
    }
  }
  await Promise.allSettled([
    wfPromise,
    admin.from("executions").insert({
      workspace_id: bot.workspace_id,
      bot_id: bot.id,
      trigger_type: trigger,
      status,
      error_code: errorCode,
      idempotency_key: `tg:${bot.id}:${update.update_id}`,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    }),
    admin.from("bots").update({ last_update_at: new Date().toISOString() }).eq("id", bot.id),
  ]);
}
