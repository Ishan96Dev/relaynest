import "server-only";
import { Errors } from "../../lib/http/api";
import type { AuthContext } from "../auth/context";
import { requireWrite } from "../auth/context";
import { setMyCommands } from "../telegram/client";
import { loadToken } from "../services/bots";
import { getBot } from "./bots";

export interface CommandDto { id: string; command: string; description: string | null; responseText: string; enabled: boolean }

const COLUMNS = "id, command, description, response_config, enabled";

function toDto(r: Record<string, unknown>): CommandDto {
  return {
    id: r.id as string,
    command: r.command as string,
    description: (r.description as string | null) ?? null,
    responseText: ((r.response_config as { text?: string } | null)?.text) ?? "",
    enabled: Boolean(r.enabled),
  };
}

export async function listCommands(ctx: AuthContext, botId: string) {
  await getBot(ctx, botId); // verifies the bot belongs to the caller's workspace
  const { data, error } = await ctx.supabase.from("bot_commands").select(COLUMNS).eq("bot_id", botId).eq("workspace_id", ctx.workspaceId).order("created_at");
  if (error) throw new Error("Failed to list commands");
  return (data ?? []).map(toDto);
}

export async function createCommands(
  ctx: AuthContext,
  botId: string,
  input: { command: string; description?: string; responseText: string; enabled: boolean }[],
) {
  requireWrite(ctx);
  await getBot(ctx, botId);
  const rows = input.map((c) => ({
    workspace_id: ctx.workspaceId,
    bot_id: botId,
    command: c.command.replace(/^\//, "").toLowerCase(),
    description: c.description ?? null,
    response_config: { text: c.responseText },
    enabled: c.enabled,
  }));
  if (new Set(rows.map((r) => r.command)).size !== rows.length) throw Errors.invalid("Command names must be unique.");
  const { data, error } = await ctx.supabase.from("bot_commands").insert(rows).select(COLUMNS);
  if (error) {
    if (error.code === "23505") throw Errors.conflict("One of these commands already exists for this bot.");
    throw new Error("Failed to create commands");
  }
  await syncTelegramCommands(ctx, botId);
  return (data ?? []).map(toDto);
}

/** Replaces all commands for a bot in Supabase and syncs enabled commands to Telegram. */
export async function replaceCommands(
  ctx: AuthContext,
  botId: string,
  input: { command: string; description?: string; responseText: string; enabled: boolean }[],
) {
  requireWrite(ctx);
  await getBot(ctx, botId);
  const rows = input.map((c) => ({
    workspace_id: ctx.workspaceId,
    bot_id: botId,
    command: c.command.replace(/^\//, "").toLowerCase(),
    description: c.description ?? null,
    response_config: { text: c.responseText },
    enabled: c.enabled,
  }));
  if (new Set(rows.map((r) => r.command)).size !== rows.length) throw Errors.invalid("Command names must be unique.");
  const { error: delErr } = await ctx.supabase.from("bot_commands").delete().eq("bot_id", botId).eq("workspace_id", ctx.workspaceId);
  if (delErr) throw new Error("Failed to update commands");
  let saved: CommandDto[] = [];
  if (rows.length > 0) {
    const { data, error } = await ctx.supabase.from("bot_commands").insert(rows).select(COLUMNS);
    if (error) throw new Error("Failed to save commands");
    saved = (data ?? []).map(toDto);
  }
  const synced = await syncTelegramCommands(ctx, botId);
  return { commands: saved, synced };
}

async function syncTelegramCommands(ctx: AuthContext, botId: string): Promise<boolean> {
  try {
    const all = await listCommands(ctx, botId);
    const token = await loadToken(botId, ctx.workspaceId);
    const tg = all
      .filter((c) => c.enabled)
      .slice(0, 100)
      .map((c) => ({ command: c.command, description: (c.description?.trim() || c.responseText.trim()).slice(0, 256) || "Run command" }));
    await setMyCommands(token, tg);
    return true;
  } catch {
    return false;
  }
}