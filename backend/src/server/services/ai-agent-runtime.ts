import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { buildCitationSources, buildSystemPrompt, clampReply, type AgentCommand, type KnowledgeItem } from "@backend/server/ai/agent";
import { formatTelegramHtmlChunks, formatTelegramPlainChunks, pickFeaturedLinkPreviewUrl } from "@backend/server/ai/citations";
import { commandTask, parseCommandText, usageText } from "@backend/server/ai/commands";
import { chat, rateLimit, type ChatMessage } from "@backend/server/ai/provider";
import { logEvent } from "@backend/server/logger";
import { AGENT_COLUMNS, toAgentConfig } from "@backend/server/services/ai-agents";
import { runMediaCommand } from "@backend/server/services/ai-agent-commands";
import { loadToken } from "@backend/server/services/bots";
import { retrieveForBot } from "@backend/server/services/knowledge-retrieval";
import { sendChatAction, sendFormattedMessages, sendMessage, type TelegramUpdate } from "@backend/server/telegram/client";

interface BotRef { id: string; workspace_id: string; telegram_username: string | null }

const KEEP_PER_CHAT = 60;

const DEFAULT_DESCRIBE_CMD: AgentCommand = {
  command: "describe",
  description: "Describe and analyze a photo",
  kind: "describe",
  instruction: "Analyze this image thoroughly, reading all visible text, numbers, labels, and key details.",
};

const DEFAULT_IMAGINE_CMD: AgentCommand = {
  command: "imagine",
  description: "Generate an image from a prompt",
  kind: "image",
  instruction: "",
};

const DEFAULT_SEARCH_CMD: AgentCommand = {
  command: "search",
  description: "Search the open web with details, images & videos",
  kind: "search",
  instruction: "",
};

/**
 * Handles a Telegram update for a bot that belongs to an AI agent. Returns false when the bot has no agent,
 * so the caller falls back to the rule-based command and keyword flow.
 */
export async function handleAgentUpdate(bot: BotRef, update: TelegramUpdate): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("ai_agents").select(AGENT_COLUMNS).eq("bot_id", bot.id).maybeSingle();
  if (!row) return false;

  const msg = update.message;
  const hasImageDoc = Boolean(msg?.document?.mime_type?.startsWith("image/"));
  const hasImage = Boolean(msg?.photo?.length || hasImageDoc);
  if (!msg || (!msg.text && !msg.caption && !hasImage)) return true;

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
    const media = { config, input: parsed.input, botId: bot.id, token, chatId: msg.chat.id, photo: msg.photo, document: msg.document };

    if (cmd === "start") {
      trigger = "command:/start";
      await send(config.welcomeMessage ?? `Hi! I'm ${config.name}. ${config.description}`);
    } else if (cmd === "help") {
      trigger = "command:/help";
      await send(
        `I'm ${config.name}. Send me a message or photo and I'll answer in detail.\n\nCommands:\n• /search <topic> — search the open web with detailed summaries, tables, links, images & videos\n• /imagine <prompt> — generate a high-detail image\n• /describe (with a photo) — analyze images, text & charts\n• /reset — clear our conversation`,
      );
    } else if (cmd === "reset") {
      trigger = "command:/reset";
      await admin.from("ai_agent_messages").delete().eq("agent_id", config.id).eq("chat_id", chatId);
      await send("Conversation cleared.");
    } else if (custom && custom.kind !== "chat") {
      trigger = `command:/${custom.command}`;
      await runMediaCommand({ ...media, command: custom });
    } else if (!custom && cmd === "search") {
      trigger = "command:/search";
      if (config.tools.webSearch === false) {
        await send("Web search is currently disabled for this bot. Enable Open Web Search in Agent Tools to use /search.");
      } else {
        await runMediaCommand({ ...media, command: DEFAULT_SEARCH_CMD });
      }
    } else if (!custom && cmd === "imagine") {
      trigger = "command:/imagine";
      await runMediaCommand({ ...media, command: DEFAULT_IMAGINE_CMD });
    } else if (!custom && cmd === "describe") {
      trigger = "command:/describe";
      await runMediaCommand({ ...media, command: DEFAULT_DESCRIBE_CMD });
    } else if (custom && !parsed.input) {
      trigger = `command:/${custom.command}`;
      await send(usageText(custom));
    } else if (hasImage && !custom) {
      const describe = config.commands.find((c) => c.kind === "describe") ?? DEFAULT_DESCRIBE_CMD;
      trigger = `command:/${describe.command}`;
      await runMediaCommand({ ...media, input: text, command: describe });
    } else if (!config.model) {
      status = "failed";
      errorCode = "NO_MODEL";
      await send(config.fallbackMessage ?? "This bot does not have an AI model configured yet.");
    } else {
      // In groups, only answer when mentioned if the owner asked for that.
      const username = bot.telegram_username?.toLowerCase();
      const mentioned = Boolean(username && text.toLowerCase().includes(`@${username}`));
      if (!isPrivate && config.tools.mentionOnly && !mentioned) return true;
      if (username) text = text.replace(new RegExp(`@${username}`, "ig"), "").trim() || text;
      if (custom) { trigger = `command:/${custom.command}`; text = parsed.input; }

      rateLimit(`chat:${bot.id}:${chatId}`, 25, 60_000);
      if (config.tools.typing) void sendChatAction(token, msg.chat.id, "typing").catch(() => undefined);

      const [{ data: knowledge }, { data: past }, passages] = await Promise.all([
        admin.from("ai_agent_knowledge").select("title, content").eq("agent_id", config.id).order("created_at"),
        config.memoryTurns > 0
          ? admin.from("ai_agent_messages").select("role, content").eq("agent_id", config.id).eq("chat_id", chatId).order("id", { ascending: false }).limit(config.memoryTurns * 2)
          : Promise.resolve({ data: [] as { role: string; content: string }[] }),
        retrieveForBot(bot.id, bot.workspace_id, text, 5),
      ]);
      const knowledgeItems = (knowledge ?? []) as KnowledgeItem[];
      const history = ((past ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
      const citations = buildCitationSources(knowledgeItems, passages);
      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(config, knowledgeItems, new Date(), passages) + (custom ? `\n\n${commandTask(custom)}` : "") },
        ...history,
        { role: "user", content: text.slice(0, 4000) },
      ];

      // Run in fast non-thinking mode with generous token budget + resilient NVIDIA fallback so Telegram answers are rich & fast.
      const r = await chat(config.model, messages, {
        temperature: config.temperature,
        maxTokens: Math.min(Math.max(config.maxTokens, 1536), 3072),
        thinking: false,
        timeoutMs: 20_000,
        allowFallback: true,
      });

      const htmlChunks = formatTelegramHtmlChunks(r.text, citations);
      const plainChunks = formatTelegramPlainChunks(r.text, citations);
      const previewUrl = pickFeaturedLinkPreviewUrl(r.text, citations);
      await sendFormattedMessages(token, msg.chat.id, htmlChunks, plainChunks, {
        linkPreviewUrl: previewUrl,
      });

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
    const code = (e as { code?: string }).code;
    errorCode = code === "RATE_LIMITED" ? "RATE_LIMITED" : "AI_FAILED";
    logEvent("backend", "error", `Telegram agent failed (${errorCode}): ${e instanceof Error ? e.message : "unknown"}`, { botId: bot.id, trigger });
    if (errorCode === "RATE_LIMITED") {
      await send("You're sending messages very quickly — please wait a few seconds and try again.").catch(() => undefined);
    } else {
      await send(config.fallbackMessage ?? "Sorry, I couldn't answer that right now. Please try again in a moment.").catch(() => undefined);
    }
  }

  await Promise.allSettled([
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
  return true;
}

/** Keeps only the newest messages of a chat so memory stays small. */
async function prune(agentId: string, chatId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("ai_agent_messages").select("id").eq("agent_id", agentId).eq("chat_id", chatId).order("id", { ascending: false }).range(KEEP_PER_CHAT, KEEP_PER_CHAT);
  const cutoff = data?.[0]?.id as number | undefined;
  if (cutoff) await admin.from("ai_agent_messages").delete().eq("agent_id", agentId).eq("chat_id", chatId).lte("id", cutoff);
}
