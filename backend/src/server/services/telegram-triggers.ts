import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { runWorkflow } from "@backend/server/services/workflow-runner";
import type { TelegramUpdate } from "@backend/server/telegram/client";
/**
 * Starts every published automation whose "Telegram Message Received" trigger points at this bot.
 * The event payload (read in nodes as {{event.text}}, {{event.chatId}} and so on) is the message data.
 * Failures are contained: automations never block the bot's own reply.
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
    await Promise.allSettled(matches.map((w) => runWorkflow({ workflowId: w.id as string, trigger: "telegram", payload, idempotencyKey: `tgwf:${w.id}:${update.update_id}` })));
  } catch {
    console.error("[automations] telegram trigger failed");
  }
}
