import "server-only";
import { createAdminClient } from "../../lib/supabase/admin";
import type { AuthContext } from "../auth/context";
import { requireWrite } from "../auth/context";
import { getBot } from "./bots";
import { updateBotDetails } from "../services/bots";

export interface BotResponseRuleDto {
  id: string;
  matchType: "welcome" | "default" | "keyword";
  matchValue: string | null;
  responseText: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotResponsesPayload {
  welcomeMessage: string;
  defaultResponse: string;
  rules: BotResponseRuleDto[];
}

export interface BotResponseRuleWriteInput {
  matchType: "welcome" | "default" | "keyword";
  matchValue?: string | null;
  responseText: string;
  priority: number;
  enabled: boolean;
}

const COLUMNS = "id, match_type, match_value, response_text, priority, enabled, created_at, updated_at";

function toDto(r: Record<string, unknown>): BotResponseRuleDto {
  return {
    id: r.id as string,
    matchType: r.match_type as BotResponseRuleDto["matchType"],
    matchValue: (r.match_value as string | null) ?? null,
    responseText: r.response_text as string,
    priority: Number(r.priority ?? 100),
    enabled: Boolean(r.enabled),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/**
 * Keeps the `welcome` and `default` records in `public.bot_responses` aligned with `bots.welcome_message`
 * and `bots.default_response` without disturbing keyword auto-reply rules.
 */
export async function syncWelcomeDefaultResponses(
  workspaceId: string,
  botId: string,
  input: { welcomeMessage?: string | null; defaultResponse?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const upsertSingle = async (matchType: "welcome" | "default", text: string | null | undefined, priority: number) => {
    if (text === undefined) return;
    const trimmed = (text ?? "").trim();
    const { data: existing } = await admin
      .from("bot_responses")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("bot_id", botId)
      .eq("match_type", matchType)
      .order("created_at")
      .limit(5);

    const rows = existing ?? [];
    if (!trimmed) {
      if (rows.length > 0) {
        await admin.from("bot_responses").delete().in("id", rows.map((r) => r.id as string)).eq("workspace_id", workspaceId);
      }
      return;
    }

    if (rows.length > 0) {
      await admin
        .from("bot_responses")
        .update({ response_text: trimmed, enabled: true, priority })
        .eq("id", rows[0]!.id)
        .eq("workspace_id", workspaceId);
      if (rows.length > 1) {
        await admin.from("bot_responses").delete().in("id", rows.slice(1).map((r) => r.id as string)).eq("workspace_id", workspaceId);
      }
    } else {
      await admin.from("bot_responses").insert({
        workspace_id: workspaceId,
        bot_id: botId,
        match_type: matchType,
        match_value: null,
        response_text: trimmed,
        priority,
        enabled: true,
      });
    }
  };

  await Promise.allSettled([
    upsertSingle("welcome", input.welcomeMessage, 1),
    upsertSingle("default", input.defaultResponse, 999),
  ]);
}

export async function listBotResponses(ctx: AuthContext, botId: string): Promise<BotResponsesPayload> {
  const bot = await getBot(ctx, botId);
  const { data: initial, error } = await ctx.supabase
    .from("bot_responses")
    .select(COLUMNS)
    .eq("bot_id", botId)
    .eq("workspace_id", ctx.workspaceId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to list bot responses");

  let rows = initial ?? [];
  const hasWelcome = rows.some((r) => r.match_type === "welcome");
  const hasDefault = rows.some((r) => r.match_type === "default");

  // Auto-hydrate `bot_responses` if the bot already has welcome/default messages saved on `bots`.
  if ((!hasWelcome && bot.welcomeMessage?.trim()) || (!hasDefault && bot.defaultResponse?.trim())) {
    await syncWelcomeDefaultResponses(ctx.workspaceId, botId, {
      ...(bot.welcomeMessage?.trim() && !hasWelcome ? { welcomeMessage: bot.welcomeMessage } : {}),
      ...(bot.defaultResponse?.trim() && !hasDefault ? { defaultResponse: bot.defaultResponse } : {}),
    });
    const refreshed = await ctx.supabase
      .from("bot_responses")
      .select(COLUMNS)
      .eq("bot_id", botId)
      .eq("workspace_id", ctx.workspaceId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (!refreshed.error && refreshed.data) rows = refreshed.data;
  }

  const mapped = rows.map(toDto);
  const welcomeRule = mapped.find((r) => r.matchType === "welcome");
  const defaultRule = mapped.find((r) => r.matchType === "default");

  return {
    welcomeMessage: bot.welcomeMessage ?? welcomeRule?.responseText ?? "",
    defaultResponse: bot.defaultResponse ?? defaultRule?.responseText ?? "",
    rules: mapped,
  };
}

export async function saveBotResponses(
  ctx: AuthContext,
  botId: string,
  input: { welcomeMessage: string; defaultResponse: string; rules: BotResponseRuleWriteInput[] },
): Promise<BotResponsesPayload> {
  requireWrite(ctx);
  await getBot(ctx, botId);

  await updateBotDetails(ctx, botId, {
    welcomeMessage: input.welcomeMessage,
    defaultResponse: input.defaultResponse,
  });

  // Replace keyword rules in `public.bot_responses` while keeping welcome & default rows synced cleanly.
  const { error: delErr } = await ctx.supabase
    .from("bot_responses")
    .delete()
    .eq("bot_id", botId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("match_type", "keyword");
  if (delErr) throw new Error("Failed to update keyword responses");

  const keywordRows = input.rules
    .filter((r) => r.matchType === "keyword" && (r.matchValue ?? "").trim().length > 0 && r.responseText.trim().length > 0)
    .map((r, idx) => ({
      workspace_id: ctx.workspaceId,
      bot_id: botId,
      match_type: "keyword" as const,
      match_value: (r.matchValue ?? "").trim(),
      response_text: r.responseText.trim(),
      priority: Number.isFinite(r.priority) ? r.priority : (idx + 1) * 10,
      enabled: r.enabled,
    }));

  if (keywordRows.length > 0) {
    const { error: insErr } = await ctx.supabase.from("bot_responses").insert(keywordRows);
    if (insErr) throw new Error("Failed to save keyword responses");
  }

  await syncWelcomeDefaultResponses(ctx.workspaceId, botId, {
    welcomeMessage: input.welcomeMessage,
    defaultResponse: input.defaultResponse,
  });

  return listBotResponses(ctx, botId);
}
