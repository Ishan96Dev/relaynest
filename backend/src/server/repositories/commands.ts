import "server-only";
import { Errors } from "../../lib/http/api";
import { createAdminClient } from "../../lib/supabase/admin";
import { RESERVED_COMMANDS, type AgentCommand, type BotCommandResponseType } from "../../lib/validation/schemas";
import { parseCommands, parseTools, type AgentTools } from "../ai/agent";
import type { AuthContext } from "../auth/context";
import { requireWrite } from "../auth/context";
import { getMyCommands, setMyCommands } from "../telegram/client";
import { loadToken } from "../services/bots";
import { getBot } from "./bots";

export interface CommandDto {
  id: string;
  command: string;
  description: string | null;
  responseType: BotCommandResponseType;
  responseText: string;
  instruction: string;
  enabled: boolean;
}

export interface CommandWriteInput {
  command: string;
  description?: string;
  responseType?: BotCommandResponseType;
  responseText?: string;
  instruction?: string;
  enabled: boolean;
}

const COLUMNS = "id, command, description, response_type, response_config, enabled";
const VALID_TYPES = new Set<BotCommandResponseType>(["text", "builtin", "chat", "image", "describe", "search", "market", "brief"]);
const AI_COMMAND_TYPES = new Set<BotCommandResponseType>(["chat", "image", "describe", "search", "market", "brief"]);

function normalizeType(raw: unknown): BotCommandResponseType {
  return typeof raw === "string" && VALID_TYPES.has(raw as BotCommandResponseType)
    ? (raw as BotCommandResponseType)
    : "text";
}

function toDto(r: Record<string, unknown>): CommandDto {
  const cfg = (r.response_config as { text?: string; instruction?: string } | null) ?? {};
  const responseType = normalizeType(r.response_type);
  return {
    id: r.id as string,
    command: r.command as string,
    description: (r.description as string | null) ?? null,
    responseType,
    responseText: typeof cfg.text === "string" ? cfg.text : "",
    instruction: typeof cfg.instruction === "string" ? cfg.instruction : "",
    enabled: Boolean(r.enabled),
  };
}

interface AgentCommandSeed {
  name?: string | null;
  description?: string | null;
  welcomeMessage?: string | null;
  commands: AgentCommand[];
  tools?: AgentTools;
}

function buildAgentCommandRows(workspaceId: string, botId: string, agent: AgentCommandSeed) {
  const welcomeText =
    agent.welcomeMessage?.trim() ||
    `Hi! I'm ${agent.name?.trim() || "your AI assistant"}. ${agent.description?.trim() || ""}`.trim();

  const rows: Array<{
    workspace_id: string;
    bot_id: string;
    command: string;
    description: string;
    response_type: BotCommandResponseType;
    response_config: { text: string; instruction: string };
    enabled: boolean;
  }> = [
    {
      workspace_id: workspaceId,
      bot_id: botId,
      command: "start",
      description: "Start the conversation",
      response_type: "builtin",
      response_config: { text: welcomeText, instruction: "" },
      enabled: true,
    },
    {
      workspace_id: workspaceId,
      bot_id: botId,
      command: "help",
      description: "How to use this bot",
      response_type: "builtin",
      response_config: { text: "Show help and available commands", instruction: "" },
      enabled: true,
    },
    {
      workspace_id: workspaceId,
      bot_id: botId,
      command: "reset",
      description: "Clear our conversation",
      response_type: "builtin",
      response_config: { text: "Conversation cleared.", instruction: "" },
      enabled: true,
    },
  ];

  const hasSearch = agent.commands.some((c) => c.command === "search");
  if (!hasSearch && agent.tools?.webSearch !== false) {
    rows.push({
      workspace_id: workspaceId,
      bot_id: botId,
      command: "search",
      description: "Search the web with details, images & videos",
      response_type: "search",
      response_config: { text: "", instruction: "" },
      enabled: true,
    });
  }

  for (const c of agent.commands) {
    rows.push({
      workspace_id: workspaceId,
      bot_id: botId,
      command: c.command.replace(/^\//, "").toLowerCase(),
      description: c.description.slice(0, 256),
      response_type: c.kind,
      response_config: { text: c.instruction.trim() || c.description, instruction: c.instruction },
      enabled: true,
    });
  }

  return rows;
}

/**
 * Mirrors an AI agent's built-in and configured commands into `public.bot_commands` so both the
 * AI Agent editor and the Bot Configuration -> Commands tab share the same Supabase records.
 * Custom static (`response_type = 'text'`) commands added on the bot are preserved.
 */
export async function syncAgentCommandsToBotCommands(workspaceId: string, botId: string, agent: AgentCommandSeed): Promise<void> {
  const admin = createAdminClient();
  const desired = buildAgentCommandRows(workspaceId, botId, agent);
  const desiredNames = new Set(desired.map((r) => r.command));

  const { data: existing } = await admin
    .from("bot_commands")
    .select("id, command, response_type")
    .eq("bot_id", botId)
    .eq("workspace_id", workspaceId);

  const existingByCmd = new Map((existing ?? []).map((r) => [String(r.command).toLowerCase(), r]));

  // Remove AI-managed commands that were deleted from the agent (keep custom static 'text' commands untouched).
  const staleIds = (existing ?? [])
    .filter((r) => {
      const t = normalizeType(r.response_type);
      const name = String(r.command).toLowerCase();
      return (t === "builtin" || AI_COMMAND_TYPES.has(t)) && !desiredNames.has(name);
    })
    .map((r) => r.id as string);

  if (staleIds.length > 0) {
    await admin.from("bot_commands").delete().in("id", staleIds).eq("workspace_id", workspaceId);
  }

  // Do not overwrite a user's explicit static 'text' command with a generated builtin default unless missing.
  const toUpsert = desired.filter((r) => {
    const cur = existingByCmd.get(r.command);
    if (!cur) return true;
    const curType = normalizeType(cur.response_type);
    if (curType === "text" && r.response_type === "builtin") return false;
    return true;
  });

  if (toUpsert.length > 0) {
    const { error } = await admin.from("bot_commands").upsert(toUpsert, { onConflict: "bot_id,command" });
    if (error) console.error("[bot-commands] syncAgentCommandsToBotCommands failed:", error.message);
  }
}

/** Pulls commands from linked AI agent and/or Telegram `getMyCommands` and persists missing records into `public.bot_commands`. */
export async function hydrateBotCommands(workspaceId: string, botId: string, opts?: { forceTelegram?: boolean }): Promise<void> {
  const admin = createAdminClient();
  const [{ data: existing }, { data: agentRow }] = await Promise.all([
    admin.from("bot_commands").select("command, response_type").eq("bot_id", botId).eq("workspace_id", workspaceId),
    admin
      .from("ai_agents")
      .select("name, description, welcome_message, commands, tools")
      .eq("bot_id", botId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const existingNames = new Set((existing ?? []).map((r) => String(r.command).toLowerCase()));

  if (agentRow) {
    const parsedCmds = parseCommands(agentRow.commands);
    const parsedTools = parseTools(agentRow.tools);
    const expectedNames = ["start", "help", "reset", ...parsedCmds.map((c) => c.command)];
    if (parsedTools.webSearch !== false && !parsedCmds.some((c) => c.command === "search")) expectedNames.push("search");
    const missingAny = existingNames.size === 0 || expectedNames.some((n) => !existingNames.has(n));
    if (missingAny || opts?.forceTelegram) {
      await syncAgentCommandsToBotCommands(workspaceId, botId, {
        name: agentRow.name as string | null,
        description: agentRow.description as string | null,
        welcomeMessage: agentRow.welcome_message as string | null,
        commands: parsedCmds,
        tools: parsedTools,
      });
    }
    return;
  }

  // Standard bot with no rows in bot_commands yet (or explicit sync): pull registered menu commands from Telegram.
  if (existingNames.size > 0 && !opts?.forceTelegram) return;
  try {
    const token = await loadToken(botId, workspaceId);
    const tgCommands = await getMyCommands(token, 5_000);
    const toInsert = tgCommands
      .map((c) => ({
        command: c.command.replace(/^\//, "").toLowerCase(),
        description: c.description.trim().slice(0, 256),
      }))
      .filter((c) => /^[a-z0-9_]{1,32}$/.test(c.command) && !existingNames.has(c.command))
      .map((c) => ({
        workspace_id: workspaceId,
        bot_id: botId,
        command: c.command,
        description: c.description || null,
        response_type: "text",
        response_config: { text: c.description || `Handled /${c.command}`, instruction: "" },
        enabled: true,
      }));
    if (toInsert.length > 0) {
      await admin.from("bot_commands").upsert(toInsert, { onConflict: "bot_id,command" });
    }
  } catch {
    // Best-effort hydration: ignore Telegram network errors on read.
  }
}

export async function listCommands(ctx: AuthContext, botId: string, opts?: { sync?: boolean }) {
  await getBot(ctx, botId); // verifies the bot belongs to the caller's workspace
  await hydrateBotCommands(ctx.workspaceId, botId, { forceTelegram: opts?.sync });
  const { data, error } = await ctx.supabase
    .from("bot_commands")
    .select(COLUMNS)
    .eq("bot_id", botId)
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at");
  if (error) throw new Error("Failed to list commands");
  return (data ?? []).map(toDto);
}

function toInsertRow(workspaceId: string, botId: string, c: CommandWriteInput) {
  const responseType = normalizeType(c.responseType ?? "text");
  const text = (c.responseText ?? "").trim();
  const instruction = (c.instruction ?? (AI_COMMAND_TYPES.has(responseType) ? text : "")).trim();
  return {
    workspace_id: workspaceId,
    bot_id: botId,
    command: c.command.replace(/^\//, "").toLowerCase(),
    description: c.description?.trim() || null,
    response_type: responseType,
    response_config: {
      text: text || (AI_COMMAND_TYPES.has(responseType) ? instruction || c.description?.trim() || "" : ""),
      instruction,
    },
    enabled: c.enabled,
  };
}

/** Keeps linked `ai_agents.commands` in sync when commands are edited from Bot Configuration -> Commands. */
async function syncBotCommandsBackToAgent(workspaceId: string, botId: string, saved: CommandDto[]) {
  const admin = createAdminClient();
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("bot_id", botId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!agent) return;

  const agentCommands: AgentCommand[] = saved
    .filter((c) => c.enabled && AI_COMMAND_TYPES.has(c.responseType) && !RESERVED_COMMANDS.includes(c.command))
    .slice(0, 15)
    .map((c) => ({
      command: c.command,
      description: (c.description?.trim() || `Run /${c.command}`).slice(0, 100),
      kind: c.responseType as AgentCommand["kind"],
      instruction: (c.instruction || c.responseText || "").slice(0, 1000),
    }));

  const { error } = await admin
    .from("ai_agents")
    .update({ commands: agentCommands })
    .eq("id", agent.id)
    .eq("workspace_id", workspaceId);
  if (error) console.error("[bot-commands] syncBotCommandsBackToAgent failed:", error.message);
}

export async function createCommands(ctx: AuthContext, botId: string, input: CommandWriteInput[]) {
  requireWrite(ctx);
  await getBot(ctx, botId);
  const rows = input.map((c) => toInsertRow(ctx.workspaceId, botId, c));
  if (new Set(rows.map((r) => r.command)).size !== rows.length) throw Errors.invalid("Command names must be unique.");
  const { data, error } = await ctx.supabase.from("bot_commands").insert(rows).select(COLUMNS);
  if (error) {
    if (error.code === "23505") throw Errors.conflict("One of these commands already exists for this bot.");
    throw new Error("Failed to create commands");
  }
  const saved = (data ?? []).map(toDto);
  const all = await listCommands(ctx, botId);
  await syncBotCommandsBackToAgent(ctx.workspaceId, botId, all);
  await syncTelegramCommandsFromDb(ctx.workspaceId, botId, all);
  return saved;
}

/** Replaces all commands for a bot in Supabase, syncs linked AI agent commands, and updates Telegram's menu. */
export async function replaceCommands(ctx: AuthContext, botId: string, input: CommandWriteInput[]) {
  requireWrite(ctx);
  await getBot(ctx, botId);
  const rows = input.map((c) => toInsertRow(ctx.workspaceId, botId, c));
  if (new Set(rows.map((r) => r.command)).size !== rows.length) throw Errors.invalid("Command names must be unique.");
  const { error: delErr } = await ctx.supabase.from("bot_commands").delete().eq("bot_id", botId).eq("workspace_id", ctx.workspaceId);
  if (delErr) throw new Error("Failed to update commands");
  let saved: CommandDto[] = [];
  if (rows.length > 0) {
    const { data, error } = await ctx.supabase.from("bot_commands").insert(rows).select(COLUMNS);
    if (error) throw new Error("Failed to save commands");
    saved = (data ?? []).map(toDto);
  }
  await syncBotCommandsBackToAgent(ctx.workspaceId, botId, saved);
  const synced = await syncTelegramCommandsFromDb(ctx.workspaceId, botId, saved);
  await createAdminClient()
    .from("activity_logs")
    .insert({ workspace_id: ctx.workspaceId, actor_id: ctx.userId, action: "bot.commands_updated", detail: `${saved.length} commands` })
    .then(() => undefined, () => undefined);
  return { commands: saved, synced };
}

async function syncTelegramCommandsFromDb(workspaceId: string, botId: string, all: CommandDto[]): Promise<boolean> {
  try {
    const token = await loadToken(botId, workspaceId);
    const tg = all
      .filter((c) => c.enabled)
      .slice(0, 100)
      .map((c) => ({
        command: c.command,
        description: (c.description?.trim() || c.responseText.trim()).slice(0, 256) || "Run command",
      }));
    await setMyCommands(token, tg);
    return true;
  } catch {
    return false;
  }
}
