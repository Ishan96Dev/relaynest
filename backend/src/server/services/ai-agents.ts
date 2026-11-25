import "server-only";
import { z } from "zod";
import { Errors } from "@backend/lib/http/api";
import type { createAiAgentInput, knowledgeInput, testInput, updateAiAgentInput } from "@backend/lib/validation/schemas";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { buildCitationSources, buildSystemPrompt, parseCommands, parseTools, type AgentCommand, type AgentConfig, type AgentTools, type KnowledgeItem } from "@backend/server/ai/agent";
import type { CitationSource } from "@backend/server/ai/citations";
import { canPowerAgent } from "@backend/server/ai/model-catalog";
import { commandTask, imagePrompt, parseCommandText, usageText } from "@backend/server/ai/commands";
import { chat, generateImage, rateLimit, type ChatMessage } from "@backend/server/ai/provider";
import { withUsageScope } from "@backend/server/ai/usage";
import { buildWebSearchSystemContext, webSearchToCitations, type WebMediaPayload } from "@backend/server/ai/web-search-types";
import { searchOpenWeb } from "@backend/server/search/web-search";
import { getDbDefaultImageModel } from "@backend/server/services/ai-models";
import { retrieveForBot } from "@backend/server/services/knowledge-retrieval";
import { activateBot, createBot, deactivateBot, deleteBot, loadToken, updateBotDetails } from "@backend/server/services/bots";
import { assertBotLimit, assertExecutionLimit } from "@backend/server/billing/entitlements";
import { getMe, setMyCommands } from "@backend/server/telegram/client";

export type AgentStatus = "draft" | "active" | "inactive" | "error";

export interface AiAgentDto {
  id: string;
  name: string;
  username: string;
  description: string;
  avatarPath: string | null;
  language: string;
  category: string;
  modelSlug: string | null;
  modelName: string | null;
  imageModelSlug: string | null;
  imageModelName: string | null;
  commands: AgentCommand[];
  instructions: string;
  welcomeMessage: string | null;
  fallbackMessage: string | null;
  temperature: number;
  maxTokens: number;
  memoryTurns: number;
  tools: AgentTools;
  botId: string | null;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDto { id: string; title: string; content: string; createdAt: string }

export type CreateAiAgentInput = z.infer<typeof createAiAgentInput>;
export type UpdateAiAgentInput = z.infer<typeof updateAiAgentInput>;

const COLUMNS =
  "id, name, username, description, avatar_path, language, category, instructions, welcome_message, fallback_message, temperature, max_tokens, memory_turns, tools, bot_id, status, created_at, updated_at, ai_models!ai_agents_model_id_fkey(slug, name, source, api_model_id, model_type, is_thinking, is_active, fallback_model_slug, endpoint_path), commands, image_model:ai_models!ai_agents_image_model_id_fkey(slug, name, source, api_model_id, model_type, is_thinking, is_active, fallback_model_slug, endpoint_path)";

type Row = Record<string, unknown>;
type ModelJoin = {
  slug: string;
  name: string;
  source: "nvidia" | "vercel";
  api_model_id: string;
  model_type: string;
  is_thinking: boolean;
  is_active?: boolean;
  fallback_model_slug?: string | null;
  endpoint_path?: string | null;
};

const joinOne = (m: unknown): ModelJoin | null => (Array.isArray(m) ? (m[0] as ModelJoin | undefined) ?? null : (m as ModelJoin | null)) ?? null;

export function toAgentDto(r: Row): AiAgentDto {
  const model = joinOne(r.ai_models);
  return {
    id: r.id as string,
    name: r.name as string,
    username: r.username as string,
    description: r.description as string,
    avatarPath: (r.avatar_path as string | null) ?? null,
    language: r.language as string,
    category: r.category as string,
    modelSlug: model?.slug ?? null,
    modelName: model?.name ?? null,
    imageModelSlug: joinOne(r.image_model)?.slug ?? null,
    imageModelName: joinOne(r.image_model)?.name ?? null,
    commands: parseCommands(r.commands),
    instructions: (r.instructions as string) ?? "",
    welcomeMessage: (r.welcome_message as string | null) ?? null,
    fallbackMessage: (r.fallback_message as string | null) ?? null,
    temperature: Number(r.temperature ?? 0.5),
    maxTokens: Number(r.max_tokens ?? 1024),
    memoryTurns: Number(r.memory_turns ?? 10),
    tools: parseTools(r.tools),
    botId: (r.bot_id as string | null) ?? null,
    status: r.status as AgentStatus,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Maps a DB row (with its joined model) to the runtime configuration. Shared with the Telegram webhook. */
export function toAgentConfig(r: Row, workspaceId: string): AgentConfig {
  const dto = toAgentDto(r);
  const model = joinOne(r.ai_models);
  const image = joinOne(r.image_model);
  return {
    id: dto.id, workspaceId, name: dto.name, description: dto.description, category: dto.category, language: dto.language,
    instructions: dto.instructions, welcomeMessage: dto.welcomeMessage, fallbackMessage: dto.fallbackMessage, temperature: dto.temperature,
    maxTokens: dto.maxTokens, memoryTurns: dto.memoryTurns, tools: dto.tools,
    model: model
      ? {
          slug: model.slug,
          source: model.source,
          apiModelId: model.api_model_id,
          isThinking: model.is_thinking,
          isActive: model.is_active,
          fallbackModelSlug: model.fallback_model_slug,
          endpointPath: model.endpoint_path,
        }
      : null,
    imageModel: image
      ? {
          slug: image.slug,
          source: image.source,
          apiModelId: image.api_model_id,
          isActive: image.is_active,
          fallbackModelSlug: image.fallback_model_slug,
          endpointPath: image.endpoint_path,
        }
      : null,
    commands: dto.commands,
  };
}

export const AGENT_COLUMNS = COLUMNS;

export async function listAiAgents(ctx: AuthContext): Promise<AiAgentDto[]> {
  const { data, error } = await ctx.supabase.from("ai_agents").select(COLUMNS).eq("workspace_id", ctx.workspaceId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Failed to list AI agents");
  return (data ?? []).map(toAgentDto);
}

async function loadRow(ctx: AuthContext, id: string): Promise<Row> {
  const { data, error } = await ctx.supabase.from("ai_agents").select(COLUMNS).eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (error) throw new Error("Failed to load the AI agent");
  if (!data) throw Errors.notFound("AI agent");
  return data;
}

export async function getAiAgent(ctx: AuthContext, id: string): Promise<AiAgentDto> {
  return toAgentDto(await loadRow(ctx, id));
}

export async function listKnowledge(ctx: AuthContext, agentId: string): Promise<KnowledgeDto[]> {
  const { data, error } = await ctx.supabase.from("ai_agent_knowledge").select("id, title, content, created_at").eq("agent_id", agentId).eq("workspace_id", ctx.workspaceId).order("created_at");
  if (error) throw new Error("Failed to load knowledge");
  return (data ?? []).map((k) => ({ id: k.id as string, title: k.title as string, content: k.content as string, createdAt: k.created_at as string }));
}

/** Resolves a model slug to its id, rejecting models that cannot power a chat agent. */
async function resolveModelId(ctx: AuthContext, slug: string): Promise<string> {
  const { data } = await ctx.supabase.from("ai_models").select("id, slug, model_type").eq("slug", slug).maybeSingle();
  if (!data) throw Errors.invalid("The selected model does not exist.");
  if (!canPowerAgent({ slug: data.slug as string, modelType: data.model_type as never })) throw Errors.invalid("This model cannot power a chat agent. Choose a chat or multimodal language model.");
  return data.id as string;
}

/** Resolves an image model slug to its id, rejecting models that cannot generate images. */
async function resolveImageModelId(ctx: AuthContext, slug: string): Promise<string> {
  const { data } = await ctx.supabase.from("ai_models").select("id, model_type").eq("slug", slug).maybeSingle();
  if (!data) throw Errors.invalid("The selected image model does not exist.");
  if (data.model_type !== "image_generation") throw Errors.invalid("Choose an image generation model for image commands.");
  return data.id as string;
}

function checkAvatar(ctx: AuthContext, path: string | null | undefined) {
  // Accept uploads in the caller's own folder or synced Telegram photos stored under bots/.
  if (path && !path.startsWith(`${ctx.userId}/`) && !path.startsWith("bots/")) {
    throw Errors.invalid("The avatar must be uploaded from your own account.");
  }
}

export async function createAiAgent(ctx: AuthContext, input: CreateAiAgentInput): Promise<AiAgentDto> {
  requireWrite(ctx);
  await assertBotLimit(ctx.workspaceId);
  checkAvatar(ctx, input.avatarPath);
  const modelId = input.modelSlug ? await resolveModelId(ctx, input.modelSlug) : null;
  const { data, error } = await ctx.supabase
    .from("ai_agents")
    .insert({
      workspace_id: ctx.workspaceId, name: input.name, username: input.username, description: input.description, avatar_path: input.avatarPath ?? null,
      language: input.language, category: input.category, model_id: modelId, created_by: ctx.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw Errors.conflict("An AI agent with this username already exists in the workspace.");
    throw new Error("Failed to save the AI agent");
  }
  return toAgentDto(data);
}

export async function updateAiAgent(ctx: AuthContext, id: string, patch: UpdateAiAgentInput): Promise<AiAgentDto> {
  requireWrite(ctx);
  await loadRow(ctx, id);
  checkAvatar(ctx, patch.avatarPath);
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.username !== undefined) update.username = patch.username;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.avatarPath !== undefined) update.avatar_path = patch.avatarPath;
  if (patch.language !== undefined) update.language = patch.language;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.modelSlug !== undefined) update.model_id = patch.modelSlug ? await resolveModelId(ctx, patch.modelSlug) : null;
  if (patch.imageModelSlug !== undefined) update.image_model_id = patch.imageModelSlug ? await resolveImageModelId(ctx, patch.imageModelSlug) : null;
  if (patch.commands !== undefined) update.commands = patch.commands;
  if (patch.instructions !== undefined) update.instructions = patch.instructions;
  if (patch.welcomeMessage !== undefined) update.welcome_message = patch.welcomeMessage || null;
  if (patch.fallbackMessage !== undefined) update.fallback_message = patch.fallbackMessage || null;
  if (patch.temperature !== undefined) update.temperature = patch.temperature;
  if (patch.maxTokens !== undefined) update.max_tokens = patch.maxTokens;
  if (patch.memoryTurns !== undefined) update.memory_turns = patch.memoryTurns;
  if (patch.tools !== undefined) update.tools = patch.tools;
  const { data, error } = await ctx.supabase.from("ai_agents").update(update).eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") throw Errors.conflict("An AI agent with this username already exists in the workspace.");
    throw new Error("Failed to update the AI agent");
  }
  // Keep the linked bot (Supabase row and Telegram profile: name, about text, photo) in sync with the agent.
  if (data.bot_id && (patch.name !== undefined || patch.description !== undefined || patch.avatarPath !== undefined || patch.welcomeMessage !== undefined || patch.fallbackMessage !== undefined)) {
    await updateBotDetails(ctx, data.bot_id as string, {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.avatarPath !== undefined && { avatarPath: patch.avatarPath }),
      ...(patch.welcomeMessage !== undefined && { welcomeMessage: patch.welcomeMessage ?? "" }),
      ...(patch.fallbackMessage !== undefined && { defaultResponse: patch.fallbackMessage ?? "" }),
    }).catch((e) => console.error("[ai-agents] bot sync failed:", e instanceof Error ? e.message : e));
  }
  // The command menu in Telegram follows the saved commands while the agent is live (best effort).
  if ((patch.commands !== undefined || patch.tools !== undefined) && data.status === "active" && data.bot_id) {
    await syncTelegramCommands(ctx.workspaceId, data.bot_id as string, parseCommands(data.commands), parseTools(data.tools)).catch(() => undefined);
  }
  return toAgentDto(data);
}

/** Publishes the built-in and custom commands as the bot's menu in Telegram. */
export async function syncTelegramCommands(workspaceId: string, botId: string, commands: AgentCommand[], tools?: AgentTools): Promise<void> {
  const token = await loadToken(botId, workspaceId);
  const hasSearch = commands.some((c) => c.command === "search");
  const extras = !hasSearch && tools?.webSearch !== false
    ? [{ command: "search", description: "Search the web with details, images & videos" }]
    : [];
  await setMyCommands(token, [
    { command: "start", description: "Start the conversation" },
    { command: "help", description: "How to use this bot" },
    { command: "reset", description: "Clear our conversation" },
    ...extras,
    ...commands.map((c) => ({ command: c.command, description: c.description.slice(0, 256) })),
  ]);
}

export async function deleteAiAgent(ctx: AuthContext, id: string): Promise<void> {
  requireWrite(ctx);
  const agent = await loadRow(ctx, id);
  const { error } = await ctx.supabase.from("ai_agents").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the AI agent");
  // The Telegram bot only exists for this agent, so remove it (and its webhook) too.
  if (agent.bot_id) await deleteBot(ctx, agent.bot_id as string).catch(() => undefined);
}

export async function addKnowledge(ctx: AuthContext, agentId: string, input: z.infer<typeof knowledgeInput>): Promise<KnowledgeDto> {
  requireWrite(ctx);
  await loadRow(ctx, agentId);
  const { data, error } = await ctx.supabase.from("ai_agent_knowledge").insert({ workspace_id: ctx.workspaceId, agent_id: agentId, title: input.title, content: input.content }).select("id, title, content, created_at").single();
  if (error) throw new Error("Failed to save the knowledge source");
  return { id: data.id as string, title: data.title as string, content: data.content as string, createdAt: data.created_at as string };
}

export async function deleteKnowledge(ctx: AuthContext, agentId: string, knowledgeId: string): Promise<void> {
  requireWrite(ctx);
  const { error } = await ctx.supabase.from("ai_agent_knowledge").delete().eq("id", knowledgeId).eq("agent_id", agentId).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete the knowledge source");
}

/** Creates the Telegram bot for the agent from a BotFather token and links the two. */
export async function connectTelegram(ctx: AuthContext, id: string, token: string): Promise<AiAgentDto> {
  requireWrite(ctx);
  const row = await loadRow(ctx, id);
  if (row.bot_id) throw Errors.conflict("This agent is already connected to a Telegram bot.");
  const a = toAgentDto(row);
  const bot = await createBot(ctx, {
    name: a.name, description: a.description, category: a.category, token,
    welcomeMessage: a.welcomeMessage ?? undefined, defaultResponse: a.fallbackMessage ?? undefined,
  });
  const { data, error } = await ctx.supabase
    .from("ai_agents")
    .update({
      bot_id: bot.id,
      ...(bot.username ? { username: bot.username } : {}),
      ...(!a.avatarPath && bot.avatarPath ? { avatar_path: bot.avatarPath } : {}),
      status: "inactive",
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select(COLUMNS)
    .single();
  if (error) {
    await deleteBot(ctx, bot.id).catch(() => undefined);
    if (error.code === "23505") throw Errors.conflict("Another AI agent in this workspace already uses this Telegram bot.");
    throw new Error("Failed to link the Telegram bot");
  }
  return toAgentDto(data);
}

/**
 * Telegram-first onboarding: the BotFather token is the first step. Its name, username and photo become the agent's
 * starting identity, so the next wizard step only has to refine them.
 */
export async function createAgentFromToken(ctx: AuthContext, token: string): Promise<AiAgentDto> {
  requireWrite(ctx);
  await assertBotLimit(ctx.workspaceId);
  const me = await getMe(token);
  if (!me.username) throw Errors.invalid("This Telegram bot has no username yet. Finish creating it in @BotFather first.");
  const agent = await createAiAgent(ctx, {
    name: (me.firstName || me.username).slice(0, 50), username: me.username, description: "An AI assistant on Telegram.",
    avatarPath: null, language: "English", category: "Community Manager", modelSlug: null,
  } as CreateAiAgentInput);
  try {
    return await connectTelegram(ctx, agent.id, token);
  } catch (e) {
    await ctx.supabase.from("ai_agents").delete().eq("id", agent.id).eq("workspace_id", ctx.workspaceId);
    throw e;
  }
}

/** Registers the Telegram webhook and starts answering messages. */
export async function activateAiAgent(ctx: AuthContext, id: string): Promise<AiAgentDto> {
  requireWrite(ctx);
  const row = await loadRow(ctx, id);
  const a = toAgentDto(row);
  if (!a.botId) throw Errors.invalid("Connect a Telegram bot first.");
  if (!a.modelSlug) throw Errors.invalid("Choose a model for this agent first.");
  await activateBot(ctx, a.botId);
  await syncTelegramCommands(ctx.workspaceId, a.botId, a.commands, a.tools).catch(() => undefined);
  const { data, error } = await ctx.supabase.from("ai_agents").update({ status: "active" }).eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLUMNS).single();
  if (error) throw new Error("Failed to activate the AI agent");
  return toAgentDto(data);
}

export async function deactivateAiAgent(ctx: AuthContext, id: string): Promise<AiAgentDto> {
  requireWrite(ctx);
  const a = toAgentDto(await loadRow(ctx, id));
  if (a.botId) await deactivateBot(ctx, a.botId);
  const { data, error } = await ctx.supabase.from("ai_agents").update({ status: a.botId ? "inactive" : "draft" }).eq("id", id).eq("workspace_id", ctx.workspaceId).select(COLUMNS).single();
  if (error) throw new Error("Failed to deactivate the AI agent");
  return toAgentDto(data);
}

/** One reply from the agent for the in-app chat preview. Uses the saved configuration, agent knowledge, open web search and linked KB collections. */
export function testAiAgent(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof testInput>,
): Promise<{ reply: string; imageBase64?: string; sources?: CitationSource[]; webMedia?: WebMediaPayload; ms?: number }> {
  return withUsageScope({ workspaceId: ctx.workspaceId, userId: ctx.userId, origin: "agent" }, () => testAiAgentInner(ctx, id, input));
}
async function testAiAgentInner(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof testInput>,
): Promise<{ reply: string; imageBase64?: string; sources?: CitationSource[]; webMedia?: WebMediaPayload; ms?: number }> {
  const started = Date.now();
  rateLimit(`agent-test:${ctx.userId}`, 30, 60_000);
  const [, row] = await Promise.all([assertExecutionLimit(ctx.workspaceId), loadRow(ctx, id)]);
  const config = toAgentConfig(row, ctx.workspaceId);
  if (!config.model) throw Errors.invalid("Choose a model for this agent first (step 3).");
  // Slash commands behave like they do in Telegram: search fetches live web/media, image draws, describe needs a photo.
  const { cmd, input: commandInput } = parseCommandText(input.message);
  const custom = cmd ? config.commands.find((c) => c.command === cmd) : undefined;
  if (custom?.kind === "describe" || (!custom && cmd === "describe")) {
    return { reply: `Send a photo with the caption /${custom?.command ?? "describe"} in Telegram. The preview cannot attach pictures.` };
  }
  if (custom && !commandInput) return { reply: usageText(custom) };
  if (custom?.kind === "search" || (!custom && cmd === "search")) {
    if (!commandInput) return { reply: `Usage: /${custom?.command ?? "search"} <what to search on the web>` };
    if (!custom && config.tools.webSearch === false) {
      return { reply: "Open Web Search is turned off for this agent. Enable it in Tools & Capabilities to use /search." };
    }
    rateLimit(`agent-search:${ctx.userId}`, 12, 60_000);
    const bundle = await searchOpenWeb(commandInput, { maxResults: 6, maxImages: 4, maxVideos: 4 });
    const citations = webSearchToCitations(bundle.results);
    const extraGuide = custom?.instruction?.trim() ? `\n\nExtra search instructions: ${custom.instruction.trim()}` : "";
    const system = `${buildSystemPrompt(config, [], new Date(), [])}\n\n${buildWebSearchSystemContext(bundle)}${extraGuide}`;
    const r = await chat(
      config.model,
      [
        { role: "system", content: system },
        { role: "user", content: commandInput },
      ],
      {
        temperature: Math.min(config.temperature, 0.45),
        maxTokens: Math.min(Math.max(config.maxTokens, 1536), 3072),
        thinking: false,
        timeoutMs: 22_000,
        allowFallback: true,
      },
    );
    return {
      reply: r.text.slice(0, 8000),
      ...(citations.length ? { sources: citations } : {}),
      webMedia: { query: bundle.query, engine: bundle.engine, images: bundle.images, videos: bundle.videos },
      ms: Date.now() - started,
    };
  }
  if (custom?.kind === "image" || (!custom && cmd === "imagine")) {
    if (!commandInput) return { reply: `Usage: /${custom?.command ?? "imagine"} <what to draw>` };
    const imageModel = config.imageModel ?? (await getDbDefaultImageModel());
    if (!imageModel) throw Errors.invalid("No active image generation model is configured in the catalog.");
    rateLimit(`agent-image:${ctx.userId}`, 8, 60_000);
    const prompt = custom ? imagePrompt(custom, commandInput) : commandInput.slice(0, 2000);
    const img = await generateImage(imageModel, prompt);
    return { reply: commandInput.slice(0, 200), imageBase64: img.imageBase64, ms: Date.now() - started };
  }
  const [knowledge, passages] = await Promise.all([
    listKnowledge(ctx, id),
    row.bot_id ? retrieveForBot(row.bot_id as string, ctx.workspaceId, input.message, 5) : Promise.resolve([]),
  ]);
  const knowledgeItems = knowledge as KnowledgeItem[];
  const citations = buildCitationSources(knowledgeItems, passages);
  const keep = config.memoryTurns * 2;
  const history = keep > 0 ? input.history.slice(-keep) : [];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(config, knowledgeItems, new Date(), passages) + (custom ? `\n\n${commandTask(custom)}` : "") },
    ...history,
    { role: "user", content: custom ? commandInput : input.message },
  ];
  const r = await chat(config.model, messages, {
    temperature: config.temperature,
    maxTokens: Math.min(Math.max(config.maxTokens, 1536), 3072),
    thinking: false,
    timeoutMs: 22_000,
    allowFallback: true,
  });
  return {
    reply: r.text.slice(0, 8000),
    ...(citations.length ? { sources: citations } : {}),
    ms: Date.now() - started,
  };
}

export type { AgentTools };
