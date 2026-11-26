import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { isCloudflareQueueConfigured } from "@backend/server/cloudflare/bindings";
import { publishKafkaEvent } from "@backend/server/queue/kafka";
import { runWorkflow } from "@backend/server/services/workflow-runner";
import type { TelegramUpdate } from "@backend/server/telegram/client";

const LOCAL_CONCURRENCY = 3;

/**
 * Starts every published automation whose "Telegram Message Received" trigger points at this bot.
 * On Cloudflare Workers with `RELAYNEST_QUEUE` bound, matching workflows are enqueued onto Cloudflare Queues
 * so bursts across bots/workflows drain smoothly without tripping Telegram rate limits.
 * Outside Cloudflare, runs in bounded batches of 3 so failures stay contained.
 */
export async function triggerTelegramWorkflows(bot: { id: string; workspace_id: string }, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  try {
    const { data } = await createAdminClient().from("workflows").select("id, definition").eq("workspace_id", bot.workspace_id).eq("status", "active").limit(200);
    const command = /^\/([a-zA-Z0-9_]{1,32})(?:@\w+)?(?:\s|$)/.exec(msg.text.trim())?.[1]?.toLowerCase() ?? "";
    const payload = {
      text: msg.text, command, chatId: String(msg.chat.id), messageId: msg.message_id, updateId: update.update_id, botId: bot.id,
      from: { id: msg.from?.id ?? null, username: msg.from?.username ?? "", firstName: msg.from?.first_name ?? "" },
    };
    const matches = (data ?? []).filter((w) => {
      const nodes = ((w.definition as { nodes?: { type: string; config?: { botId?: string; commandFilter?: string } }[] })?.nodes ?? []);
      const t = nodes.find((n) => n.type === "trigger.telegram.message");
      if (!t || t.config?.botId !== bot.id) return false;
      const filter = t.config?.commandFilter?.replace(/^\//, "").trim().toLowerCase();
      return !filter || filter === command;
    });
    if (!matches.length) return;

    if (isCloudflareQueueConfigured()) {
      await Promise.allSettled(
        matches.map((w, idx) =>
          publishKafkaEvent(
            "workflows.execute",
            {
              workflowId: w.id as string,
              trigger: "telegram",
              payload,
              idempotencyKey: `tgwf:${w.id}:${update.update_id}`,
            },
            `${bot.id}:${w.id}`,
            idx > 0 ? { delaySeconds: Math.min(idx, 10) } : undefined,
          ),
        ),
      );
      return;
    }

    for (let i = 0; i < matches.length; i += LOCAL_CONCURRENCY) {
      const slice = matches.slice(i, i + LOCAL_CONCURRENCY);
      await Promise.allSettled(
        slice.map((w) =>
          runWorkflow({
            workflowId: w.id as string,
            trigger: "telegram",
            payload,
            idempotencyKey: `tgwf:${w.id}:${update.update_id}`,
          }),
        ),
      );
    }
  } catch {
    console.error("[automations] telegram trigger failed");
  }
}
