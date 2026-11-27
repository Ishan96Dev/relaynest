import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { buildCitationSources, buildSystemPrompt, clampReply, type AgentCommand, type KnowledgeItem } from "@backend/server/ai/agent";
import { formatTelegramHtmlChunks, formatTelegramPlainChunks, pickFeaturedLinkPreviewUrl } from "@backend/server/ai/citations";
import { commandTask, parseCommandText, usageText } from "@backend/server/ai/commands";
import { chat, type ChatMessage } from "@backend/server/ai/provider";
import { withUsageScope } from "@backend/server/ai/usage";
import { logEvent } from "@backend/server/logger";
import { notifyOwners } from "@backend/server/notifications";
import { enforceRateLimit } from "@backend/server/security/rate-limit";
import { AGENT_COLUMNS, toAgentConfig } from "@backend/server/services/ai-agents";
import { runMediaCommand } from "@backend/server/services/ai-agent-commands";
import { runAgenticTools } from "@backend/server/services/agentic-runner";
import { loadToken } from "@backend/server/services/bots";
import {
  buildTelegramTriggerPayload,
  ExecutionTracer,
  finishExecutionRecord,
  safeErrorMessage,
  startExecutionRecord,
} from "@backend/server/services/execution-trace";
import { retrieveForBot } from "@backend/server/services/knowledge-retrieval";
import { isTelegramRateLimitError, sendChatAction, type TelegramUpdate } from "@backend/server/telegram/client";
import { dispatchTelegramFormattedMessages, dispatchTelegramMessage } from "@backend/server/telegram/outbound";

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

const DEFAULT_STOCK_CMD: AgentCommand = {
  command: "stock",
  description: "Check live NSE, BSE & MSE stock prices or detailed reports",
  kind: "market",
  instruction: "Check live NSE, BSE and MSE stock prices. Give a quick single quote or a detailed multi-exchange breakdown based on the prompt.",
};

const DEFAULT_MARKET_CMD: AgentCommand = {
  command: "market",
  description: "Today's NIFTY 50, SENSEX & Indian market overview",
  kind: "market",
  instruction: "Fetch live NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX and latest Indian market headlines.",
};

const DEFAULT_BRIEF_CMD: AgentCommand = {
  command: "brief",
  description: "Run an on-demand live intelligence briefing",
  kind: "brief",
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

  // In groups, ignore unmentioned plain messages before creating an execution trace.
  const parsed = parseCommandText(text);
  const cmd = parsed.cmd;
  const custom = cmd ? config.commands.find((c) => c.command === cmd) : undefined;
  const username = bot.telegram_username?.toLowerCase();
  const mentioned = Boolean(username && text.toLowerCase().includes(`@${username}`));
  const isSpecialBranch =
    cmd === "start" ||
    cmd === "help" ||
    cmd === "reset" ||
    Boolean(custom && custom.kind !== "chat") ||
    (!custom && (cmd === "search" || cmd === "imagine" || cmd === "describe" || cmd === "stock" || cmd === "market" || cmd === "brief")) ||
    Boolean(custom && !parsed.input) ||
    Boolean(hasImage && !custom);
  if (!isSpecialBranch && !isPrivate && config.tools.mentionOnly && !mentioned) {
    return true;
  }

  const started = Date.now();
  const tracer = new ExecutionTracer({ startedMs: started });
  const runState: { status: "succeeded" | "failed"; errorCode: string | null; errorMessageSafe: string | null } = {
    status: "succeeded",
    errorCode: null,
    errorMessageSafe: null,
  };
  let trigger = cmd ? `command:/${cmd}` : hasImage ? `command:/${(config.commands.find((c) => c.kind === "describe") ?? DEFAULT_DESCRIBE_CMD).command}` : "ai_message";
  const idempotencyKey = `tg:${bot.id}:${update.update_id}`;

  const triggerPayload = buildTelegramTriggerPayload(update, {
    botUsername: bot.telegram_username,
    command: cmd ? `/${cmd}` : null,
    commandInput: parsed.input || null,
    kind: custom?.kind ?? (cmd ?? (hasImage ? "describe" : "chat")),
  });

  tracer.record("telegram_received", "telegram.received", {
    startedMs: started,
    finishedMs: Date.now(),
    inputSummary: {
      command: cmd ? `/${cmd}` : undefined,
      text: text || (hasImage ? "[Photo attachment]" : ""),
      chatId,
      chatType: msg.chat.type,
      fromUsername: msg.from?.username,
      fromFirstName: msg.from?.first_name,
      updateId: update.update_id,
      messageId: msg.message_id,
      hasPhoto: hasImage,
    },
    outputSummary: {
      agentName: config.name,
      botUsername: bot.telegram_username ?? undefined,
    },
  });

  const executionId = await startExecutionRecord({
    workspaceId: bot.workspace_id,
    botId: bot.id,
    triggerType: trigger,
    idempotencyKey,
    startedMs: started,
    triggerPayload,
  });

  const token = await loadToken(bot.id, bot.workspace_id);
  const send = (reply: string, nodeId = "telegram_send_reply", nodeType = "telegram.send_message") => {
    const clamped = clampReply(reply);
    return tracer.trace(
      nodeId,
      nodeType,
      { chatId, format: "text", isGroup: !isPrivate },
      () =>
        dispatchTelegramMessage({
          botId: bot.id,
          workspaceId: bot.workspace_id,
          token,
          chatId,
          kind: "text",
          text: clamped,
          isGroup: !isPrivate,
        }),
      (res) => ({
        delivered: res.delivered,
        queued: res.queued,
        messageId: res.messageId,
        chunks: 1,
        replyPreview: clamped.slice(0, 600),
      }),
    );
  };

  await withUsageScope(
    { workspaceId: bot.workspace_id, origin: "agent", botId: bot.id, executionId: executionId ?? undefined },
    async () => {
      try {
        const media = {
          config,
          input: parsed.input,
          botId: bot.id,
          workspaceId: bot.workspace_id,
          token,
          chatId: msg.chat.id,
          isGroup: !isPrivate,
          photo: msg.photo,
          document: msg.document,
          tracer,
        };

        const { data: staticCmdRow } = cmd
          ? await admin
              .from("bot_commands")
              .select("response_type, response_config, enabled")
              .eq("bot_id", bot.id)
              .eq("command", cmd)
              .eq("enabled", true)
              .maybeSingle()
          : { data: null };
        const staticTextReply =
          staticCmdRow?.response_type === "text"
            ? (((staticCmdRow.response_config as { text?: string } | null)?.text) ?? "").trim()
            : "";

        if (cmd === "start") {
          trigger = "command:/start";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/start" },
            outputSummary: { command: "/start", kind: staticTextReply ? "custom-text" : "built-in" },
          });
          await send(staticTextReply || (config.welcomeMessage ?? `Hi! I'm ${config.name}. ${config.description}`));
        } else if (cmd === "help") {
          trigger = "command:/help";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/help" },
            outputSummary: { command: "/help", kind: staticTextReply ? "custom-text" : "built-in" },
          });
          const customLines = config.commands.map((c) => `• /${c.command} — ${c.description}`);
          const defaultLines = [
            ...(config.tools.marketData && !config.commands.some((c) => c.command === "stock")
              ? ["• /stock <symbol> — live NSE, BSE & MSE stock quote or detailed analysis"]
              : []),
            ...(config.tools.marketData && !config.commands.some((c) => c.command === "market")
              ? ["• /market — live NIFTY 50, SENSEX & Indian market overview"]
              : []),
            ...((config.tools.autoSearch || config.tools.webSearch !== false) && !config.commands.some((c) => c.command === "brief")
              ? ["• /brief [topic] — live intelligence briefing"]
              : []),
            ...(config.tools.webSearch !== false && !config.commands.some((c) => c.command === "search")
              ? ["• /search <topic> — search the open web with summaries, tables, links, images & videos"]
              : []),
            "• /imagine <prompt> — generate a high-detail image",
            "• /describe (with a photo) — analyze images, text & charts",
            "• /reset — clear our conversation",
          ];
          await send(
            staticTextReply ||
              `I'm ${config.name}. Send me a message or photo and I'll answer in detail.${config.tools.autoSearch || config.tools.marketData ? " I automatically search live data when needed." : ""}\n\nCommands:\n${[...customLines, ...defaultLines].join("\n")}`,
          );
        } else if (cmd === "reset") {
          trigger = "command:/reset";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/reset" },
            outputSummary: { command: "/reset", kind: "built-in" },
          });
          await tracer.trace(
            "clear_memory",
            "memory.clear",
            { agentId: config.id, chatId },
            async () => {
              await admin.from("ai_agent_messages").delete().eq("agent_id", config.id).eq("chat_id", chatId);
            },
            () => ({ cleared: true }),
          );
          await send("Conversation cleared.");
        } else if (!custom && staticTextReply) {
          trigger = `command:/${cmd}`;
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: `/${cmd}` },
            outputSummary: { command: `/${cmd}`, kind: "text", source: "bot_commands" },
          });
          await send(staticTextReply);
        } else if (custom && custom.kind !== "chat") {
          trigger = `command:/${custom.command}`;
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: `/${custom.command}`, input: parsed.input },
            outputSummary: { command: `/${custom.command}`, kind: custom.kind, custom: true },
          });
          await runMediaCommand({ ...media, command: custom });
        } else if (!custom && cmd === "search") {
          trigger = "command:/search";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/search", input: parsed.input },
            outputSummary: { command: "/search", kind: "search", webSearchEnabled: config.tools.webSearch !== false },
          });
          if (config.tools.webSearch === false) {
            await send("Web search is currently disabled for this bot. Enable Open Web Search in Agent Tools to use /search.");
          } else {
            await runMediaCommand({ ...media, command: DEFAULT_SEARCH_CMD });
          }
        } else if (!custom && (cmd === "stock" || cmd === "market")) {
          trigger = `command:/${cmd}`;
          const builtInCmd = cmd === "stock" ? DEFAULT_STOCK_CMD : DEFAULT_MARKET_CMD;
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: `/${cmd}`, input: parsed.input },
            outputSummary: { command: `/${cmd}`, kind: "market", marketDataEnabled: Boolean(config.tools.marketData || config.tools.webSearch !== false) },
          });
          await runMediaCommand({ ...media, command: builtInCmd });
        } else if (!custom && cmd === "brief") {
          trigger = "command:/brief";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/brief", input: parsed.input },
            outputSummary: { command: "/brief", kind: "brief" },
          });
          await runMediaCommand({ ...media, command: DEFAULT_BRIEF_CMD });
        } else if (!custom && cmd === "imagine") {
          trigger = "command:/imagine";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/imagine", input: parsed.input },
            outputSummary: { command: "/imagine", kind: "image", model: config.imageModel?.slug ?? "catalog-default" },
          });
          await runMediaCommand({ ...media, command: DEFAULT_IMAGINE_CMD });
        } else if (!custom && cmd === "describe") {
          trigger = "command:/describe";
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: "/describe", input: parsed.input, hasPhoto: hasImage },
            outputSummary: { command: "/describe", kind: "describe" },
          });
          await runMediaCommand({ ...media, command: DEFAULT_DESCRIBE_CMD });
        } else if (custom && !parsed.input) {
          trigger = `command:/${custom.command}`;
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: `/${custom.command}` },
            outputSummary: { command: `/${custom.command}`, kind: custom.kind, missingInput: true },
          });
          await send(usageText(custom));
        } else if (hasImage && !custom) {
          const describe = config.commands.find((c) => c.kind === "describe") ?? DEFAULT_DESCRIBE_CMD;
          trigger = `command:/${describe.command}`;
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: `/${describe.command}`, caption: text, hasPhoto: true },
            outputSummary: { command: `/${describe.command}`, kind: "describe", autoMatchedPhoto: true },
          });
          await runMediaCommand({ ...media, input: text, command: describe });
        } else if (!config.model) {
          runState.status = "failed";
          runState.errorCode = "NO_MODEL";
          runState.errorMessageSafe = "No AI model is configured for this agent yet.";
          tracer.record("model_check", "ai.chat", {
            status: "failed",
            errorCode: runState.errorCode,
            errorMessageSafe: runState.errorMessageSafe,
          });
          await send(config.fallbackMessage ?? "This bot does not have an AI model configured yet.", "fallback_reply", "telegram.fallback_sent");
        } else {
          if (username) text = text.replace(new RegExp(`@${username}`, "ig"), "").trim() || text;
          // Respect explicit enabled keyword auto-reply rules stored in `public.bot_responses`.
          if (!custom && text) {
            const { data: kwRules } = await admin
              .from("bot_responses")
              .select("match_value, response_text")
              .eq("bot_id", bot.id)
              .eq("match_type", "keyword")
              .eq("enabled", true)
              .order("priority", { ascending: true });
            const kwHit = (kwRules ?? []).find(
              (r) => r.match_value && text.toLowerCase().includes(String(r.match_value).toLowerCase()),
            );
            if (kwHit?.response_text) {
              trigger = "keyword";
              tracer.record("match_keyword", "rule.matched", {
                inputSummary: { ruleType: "keyword", text: text.slice(0, 200) },
                outputSummary: { ruleType: "keyword", matchedValue: String(kwHit.match_value) },
              });
              await send(String(kwHit.response_text));
              return;
            }
          }
          if (custom) {
            trigger = `command:/${custom.command}`;
            text = parsed.input;
          }
          tracer.record("route_command", "command.parsed", {
            inputSummary: { command: custom ? `/${custom.command}` : undefined, textPreview: text.slice(0, 300) },
            outputSummary: { command: custom ? `/${custom.command}` : undefined, kind: "chat", model: config.model.slug },
          });

          await enforceRateLimit(`chat:${bot.id}:${chatId}`, 25, 60_000);
          if (config.tools.typing) void sendChatAction(token, msg.chat.id, "typing").catch(() => undefined);

          const [{ data: knowledge }, { data: past }, passages] = await tracer.trace(
            "load_context",
            "context.load",
            { agentId: config.id, memoryTurns: config.memoryTurns, queryPreview: text.slice(0, 200) },
            () =>
              Promise.all([
                admin.from("ai_agent_knowledge").select("title, content").eq("agent_id", config.id).order("created_at"),
                config.memoryTurns > 0
                  ? admin.from("ai_agent_messages").select("role, content").eq("agent_id", config.id).eq("chat_id", chatId).order("id", { ascending: false }).limit(config.memoryTurns * 2)
                  : Promise.resolve({ data: [] as { role: string; content: string }[] }),
                retrieveForBot(bot.id, bot.workspace_id, text, 5),
              ]),
            ([kRes, pRes, kbPassages]) => ({
              agentKnowledge: kRes.data?.length ?? 0,
              memoryMessages: pRes.data?.length ?? 0,
              kbPassages: kbPassages.length,
            }),
          );
          const knowledgeItems = (knowledge ?? []) as KnowledgeItem[];
          const history = ((past ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
          const baseCitations = buildCitationSources(knowledgeItems, passages);

          // Autonomous Agentic Research: automatically fetch live NSE/BSE/MSE market quotes & web sources when enabled.
          const agentic =
            config.tools.autoSearch || config.tools.marketData
              ? await runAgenticTools({
                  message: text,
                  command: custom ?? null,
                  autoSearch: Boolean(config.tools.autoSearch),
                  marketData: Boolean(config.tools.marketData),
                  agentCategory: config.category,
                  citationStartIndex: baseCitations.length + 1,
                  maxResults: 6,
                  maxImages: 3,
                  maxVideos: 3,
                  tracer,
                })
              : null;

          const citations = agentic ? [...baseCitations, ...agentic.citations] : baseCitations;
          const systemParts = [
            buildSystemPrompt(config, knowledgeItems, new Date(), passages),
            custom ? commandTask(custom) : "",
            agentic?.systemContext ?? "",
          ].filter(Boolean);
          const messages: ChatMessage[] = [
            { role: "system", content: systemParts.join("\n\n") },
            ...history,
            { role: "user", content: text.slice(0, 4000) },
          ];

          // Run in fast non-thinking mode with generous token budget + resilient NVIDIA fallback so Telegram answers are rich & fast.
          const r = await tracer.trace(
            "ai_chat",
            "ai.chat",
            {
              model: config.model.apiModelId,
              modelSlug: config.model.slug,
              source: config.model.source,
              temperature: config.temperature,
              maxTokens: Math.min(Math.max(config.maxTokens, 1536), 3072),
              promptPreview: text.slice(0, 400),
              citations: citations.length,
              agenticPlan: agentic?.plan.reason ?? "none",
            },
            () =>
              chat(config.model!, messages, {
                temperature: config.temperature,
                maxTokens: Math.min(Math.max(config.maxTokens, 1536), 3072),
                thinking: false,
                timeoutMs: 20_000,
                allowFallback: true,
              }),
            (res) => ({
              modelUsed: res.modelUsed ?? config.model!.apiModelId,
              modelSlug: res.modelSlug ?? config.model!.slug,
              source: res.source ?? config.model!.source,
              usedFallback: Boolean(res.usedFallback),
              promptTokens: res.usage.promptTokens,
              completionTokens: res.usage.completionTokens,
              totalTokens: res.usage.totalTokens,
              costUsd: res.usage.costUsd ?? 0,
              outputPreview: res.text.slice(0, 800),
            }),
          );

          const mediaLinks = agentic?.webMedia?.videos.length ? { videos: agentic.webMedia.videos } : undefined;
          const htmlChunks = formatTelegramHtmlChunks(r.text, citations, mediaLinks);
          const plainChunks = formatTelegramPlainChunks(r.text, citations, mediaLinks);
          const previewUrl = pickFeaturedLinkPreviewUrl(r.text, citations, mediaLinks);
          await tracer.trace(
            "telegram_send_reply",
            "telegram.send_message",
            { chatId, chunks: htmlChunks.length, format: "html", linkPreviewUrl: previewUrl ?? undefined },
            () =>
              dispatchTelegramFormattedMessages({
                botId: bot.id,
                workspaceId: bot.workspace_id,
                token,
                chatId: msg.chat.id,
                htmlChunks,
                plainChunks,
                linkPreviewUrl: previewUrl,
                preferLargeMedia: Boolean(mediaLinks?.videos.length),
                isGroup: !isPrivate,
              }),
            (res) => ({
              deliveredCount: res.deliveredCount,
              queuedCount: res.queuedCount,
              messageIds: res.messageIds,
              chunks: htmlChunks.length,
              replyPreview: r.text.slice(0, 600),
            }),
          );

          if (config.memoryTurns > 0) {
            await tracer.trace(
              "save_memory",
              "memory.save",
              { chatId, memoryTurns: config.memoryTurns },
              async () => {
                await admin.from("ai_agent_messages").insert([
                  { workspace_id: bot.workspace_id, agent_id: config.id, chat_id: chatId, role: "user", content: text.slice(0, 4000) },
                  { workspace_id: bot.workspace_id, agent_id: config.id, chat_id: chatId, role: "assistant", content: r.text.slice(0, 7900) },
                ]);
                await prune(config.id, chatId);
              },
              () => ({ savedTurns: 1 }),
            );
          }
        }
      } catch (e) {
        runState.status = "failed";
        const code = (e as { code?: string }).code;
        const tgLimited = isTelegramRateLimitError(e);
        const isImageTrigger = custom?.kind === "image" || (!custom && cmd === "imagine");
        runState.errorCode = tgLimited ? "TELEGRAM_RATE_LIMITED" : code === "RATE_LIMITED" ? "RATE_LIMITED" : code || "AI_FAILED";
        runState.errorMessageSafe = safeErrorMessage(e, "An upstream error prevented a reply on Telegram.");
        logEvent("backend", "error", `Telegram agent failed (${runState.errorCode}): ${runState.errorMessageSafe}`, { botId: bot.id, trigger });
        // Never fire an extra fallback message into a chat that Telegram just rate-limited.
        if (!tgLimited) {
          if (runState.errorCode === "RATE_LIMITED") {
            await send("You're sending messages very quickly — please wait a few seconds and try again.", "fallback_reply", "telegram.fallback_sent").catch(() => undefined);
          } else if (runState.errorCode === "IMAGE_CONTENT_FILTERED") {
            await send(
              "The image safety filter blocked that prompt (brand names or copyrighted character names can trigger it). Try describing the look, colors, and scene visually instead.",
              "fallback_reply",
              "telegram.fallback_sent",
            ).catch(() => undefined);
          } else if (isImageTrigger && runState.errorCode === "PROVIDER_TIMEOUT") {
            await send(
              "Image generation took too long at the provider — please try again in a moment.",
              "fallback_reply",
              "telegram.fallback_sent",
            ).catch(() => undefined);
          } else {
            await send(config.fallbackMessage ?? "Sorry, I couldn't answer that right now. Please try again in a moment.", "fallback_reply", "telegram.fallback_sent").catch(() => undefined);
          }
        }
      }
    },
  );

  await finishExecutionRecord({
    executionId,
    workspaceId: bot.workspace_id,
    botId: bot.id,
    triggerType: trigger,
    status: runState.status,
    startedMs: started,
    errorCode: runState.errorCode,
    errorMessageSafe: runState.errorMessageSafe,
    idempotencyKey,
    triggerPayload,
    tracer,
    incrementMessages: true,
  });

  if (runState.status === "failed" && runState.errorCode !== "IMAGE_CONTENT_FILTERED") {
    void notifyOwners(bot.workspace_id, {
      kind: "agent_execution_failed",
      title: `AI Agent reply failed: ${config.name}`,
      body:
        runState.errorCode === "NO_MODEL"
          ? "No AI model is assigned to this agent. Select a model in AI Agents."
          : runState.errorCode === "RATE_LIMITED"
            ? "The agent hit its chat rate limit while replying to Telegram."
            : runState.errorCode === "PROVIDER_TIMEOUT"
              ? "The upstream AI provider timed out before replying to Telegram."
              : "An upstream AI provider error prevented a reply on Telegram.",
      actionUrl: `/ai/agents/${config.id}`,
      dedupeHours: 1,
      dedupeByTitle: true,
    });
  }
  return true;
}

/** Keeps only the newest messages of a chat so memory stays small. */
async function prune(agentId: string, chatId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("ai_agent_messages").select("id").eq("agent_id", agentId).eq("chat_id", chatId).order("id", { ascending: false }).range(KEEP_PER_CHAT, KEEP_PER_CHAT);
  const cutoff = data?.[0]?.id as number | undefined;
  if (cutoff) await admin.from("ai_agent_messages").delete().eq("agent_id", agentId).eq("chat_id", chatId).lte("id", cutoff);
}
