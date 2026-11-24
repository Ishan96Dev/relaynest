import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { buildSystemPrompt, clampReply, type KnowledgeItem } from "@backend/server/ai/agent";
import { commandTask, parseCommandText, usageText } from "@backend/server/ai/commands";
import { chat, rateLimit, type ChatMessage } from "@backend/server/ai/provider";
import { AGENT_COLUMNS, toAgentConfig } from "@backend/server/services/ai-agents";
import { runMediaCommand } from "@backend/server/services/ai-agent-commands";
import { loadToken } from "@backend/server/services/bots";
import { retrieveForBot } from "@backend/server/services/knowledge-retrieval";
import { sendChatAction, sendMessage, type TelegramUpdate } from "@backend/server/telegram/client";

interface BotRef { id: string; workspace_id: string; telegram_username: string | null }

const KEEP_PER_CHAT = 60;

/**
 * Handles a Telegram update for a bot that belongs to an AI agent. Returns false when the bot has no agent,
 * so the caller falls back to the rule-based command and keyword flow.
 */
export async function handleAgentUpdate(bot: BotRef, update: TelegramUpdate): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("ai_agents").select(AGENT_COLUMNS).eq("bot_id", bot.id).maybeSingle();
  if (!row) return false;

  const msg = update.message;
  if (!msg || (!msg.text && !msg.photo)) return true;
  const config = toAgentConfig(row, bot.workspace_id);
  const chatId = String(msg.chat.id);
  const isPrivate = msg.chat.type === "private";
  let text = (msg.text ?? msg.caption ?? "").trim();
  const started = Date.now();
  let status: "succeeded" | "failed" = "succeeded";
  let errorCode: string | null = null;
  let trigger = "ai_message";
  const token = await loadToken(bot.id, bot.workspace_id);
  const send = (reply: string) => sendMessage(token, msg.chat.id, clampReply(reply));

  try {
    const parsed = parseCommandText(text);
    const cmd = parsed.cmd;
    const custom = cmd ? config.commands.find((c) => c.command === cmd) : undefined;
    const media = { config, input: parsed.input, botId: bot.id, token, chatId: msg.chat.id, photo: msg.photo };
    if (cmd === "start") {
      trigger = "command:/start";
      await send(config.welcomeMessage ?? `Hi! I'm ${config.name}. ${config.description}`);
    } else if (cmd === "help") {
      trigger = "command:/help";
      await send(`I'm ${config.name}. Send me a message and I'll answer. Use /reset to clear our conversation.`);
    } else if (cmd === "reset") {
      trigger = "command:/reset";
      await admin.from("ai_agent_messages").delete().eq("agent_id", config.id).eq("chat_id", chatId);
      await send("Conversation cleared.");
    } else if (custom && custom.kind !== "chat") {
      trigger = `command:/${custom.command}`;
      await runMediaCommand({ ...media, command: custom });
    } else if (custom && !parsed.input) {
      trigger = `command:/${custom.command}`;
      await send(usageText(custom));
    } else if (msg.photo && !custom) {
      // A photo with no command goes to the describe command when the agent has one.
      const describe = config.commands.find((c) => c.kind === "describe");
      trigger = describe ? `command:/${describe.command}` : "photo";
      if (describe) await runMediaCommand({ ...media, command: describe });
      else await send("I can only read text messages. Please type your question.");
    } else if (!config.model) {
      status = "failed";
      errorCode = "NO_MODEL";
    } else {
      // In groups, only answer when mentioned (or replied to) if the owner asked for that.
      const username = bot.telegram_username?.toLowerCase();
      const mentioned = Boolean(username && text.toLowerCase().includes(`@${username}`));
      if (!isPrivate && config.tools.mentionOnly && !mentioned) return true;
      if (username) text = text.replace(new RegExp(`@${username}`, "ig"), "").trim() || text;
      // A chat command answers its own input and adds its task to the prompt.
      if (custom) { trigger = `command:/${custom.command}`; text = parsed.input; }

      rateLimit(`chat:${bot.id}:${chatId}`, 12, 60_000);
      if (config.tools.typing) void sendChatAction(token, msg.chat.id, "typing").catch(() => undefined);

      const [{ data: knowledge }, { data: past }, passages] = await Promise.all([
        admin.from("ai_agent_knowledge").select("title, content").eq("agent_id", config.id).order("created_at"),
        config.memoryTurns > 0
          ? admin.from("ai_agent_messages").select("role, content").eq("agent_id", config.id).eq("chat_id", chatId).order("id", { ascending: false }).limit(config.memoryTurns * 2)
          : Promise.resolve({ data: [] as { role: string; content: string }[] }),
        // Passages from any Knowledge Base collections shared with this bot.
        retrieveForBot(bot.id, bot.workspace_id, text),
      ]);
      const history = ((past ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(config, (knowledge ?? []) as KnowledgeItem[], new Date(), passages) + (custom ? `\n\n${commandTask(custom)}` : "") },
        ...history,
        { role: "user", content: text.slice(0, 4000) },
      ];
      const r = await chat(config.model, messages, { temperature: config.temperature, maxTokens: config.maxTokens });
      await send(r.text);
      if (config.memoryTurns > 0) {
        await admin.from("ai_agent_messages").insert([
          { workspace_id: bot.workspace_id, agent_id: config.id, chat_id: chatId, role: "user", content: text.slice(0, 4000) },
          { workspace_id: bot.workspace_id, agent_id: config.id, chat_id: chatId, role: "assistant", content: r.text.slice(0, 7900) },
        ]);
        await prune(config.id, chatId);
      }
    }
  } catch (e) {
    status = "failed";
    errorCode = (e as { code?: string }).code === "RATE_LIMITED" ? "RATE_LIMITED" : "AI_FAILED";
    // A rate-limited chat gets no reply; for real failures, tell the person something instead of staying silent.
    if (errorCode === "AI_FAILED") await send(config.fallbackMessage ?? "Sorry, I couldn't answer that right now. Please try again in a moment.").catch(() => undefined);
  }

  await admin.from("executions").insert({
    workspace_id: bot.workspace_id,
    bot_id: bot.id,
    trigger_type: trigger,
    status,
    error_code: errorCode,
    idempotency_key: `tg:${bot.id}:${update.update_id}`,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
  });
  await admin.from("bots").update({ last_update_at: new Date().toISOString() }).eq("id", bot.id);
  return true;
}

/** Keeps only the newest messages of a chat so memory stays small. */
async function prune(agentId: string, chatId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("ai_agent_messages").select("id").eq("agent_id", agentId).eq("chat_id", chatId).order("id", { ascending: false }).range(KEEP_PER_CHAT, KEEP_PER_CHAT);
  const cutoff = data?.[0]?.id as number | undefined;
  if (cutoff) await admin.from("ai_agent_messages").delete().eq("agent_id", agentId).eq("chat_id", chatId).lte("id", cutoff);
}
