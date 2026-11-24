import "server-only";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "@backend/lib/crypto";
import { Errors } from "@backend/lib/http/api";
import { serverEnv } from "@backend/lib/env/server";
import { publicEnv } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { notify, notifyOwners } from "@backend/server/notifications";
import { BUCKETS } from "@backend/lib/supabase/storage";
import { logEvent } from "@backend/server/logger";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { assertBotLimit, assertExecutionLimit } from "@backend/server/billing/entitlements";
import { BOT_COLUMNS, getBot, toBotDto, type BotDto } from "@backend/server/repositories/bots";
import { recordBotHistory } from "@backend/server/services/bot-history";
import {
  deleteMyCommands,
  deleteWebhook,
  fetchBotProfilePhoto,
  getMe,
  getWebhookInfo,
  isTelegramBotDeletedError,
  removeMyProfilePhoto,
  sendMessage,
  setMyDescription,
  setMyName,
  setMyProfilePhoto,
  setMyShortDescription,
  setWebhook,
} from "@backend/server/telegram/client";
import { updatesMode } from "@backend/server/telegram/mode";

interface CreateBotInput {
  name: string;
  description?: string;
  category?: string;
  token: string;
  welcomeMessage?: string;
  defaultResponse?: string;
}

/** Validates the token with Telegram, encrypts it, and stores it where browser roles cannot read it. */
export async function createBot(ctx: AuthContext, input: CreateBotInput) {
  requireWrite(ctx);
  await assertBotLimit(ctx.workspaceId);
  const env = serverEnv();
  const me = await getMe(input.token);
  const admin = createAdminClient();

  const { data: bot, error } = await admin
    .from("bots")
    .insert({
      workspace_id: ctx.workspaceId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      telegram_bot_id: String(me.id),
      telegram_username: me.username,
      welcome_message: input.welcomeMessage ?? null,
      default_response: input.defaultResponse ?? null,
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw Errors.conflict("This Telegram bot is already connected to the workspace.");
    throw new Error("Failed to create bot");
  }

  const encrypted = await encryptSecret(input.token, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_VERSION);
  const { error: credErr } = await admin.from("bot_credentials").insert({
    workspace_id: ctx.workspaceId,
    bot_id: bot.id,
    encrypted_token: encrypted,
    encryption_version: "v1",
    key_version: env.ENCRYPTION_KEY_VERSION,
  });
  if (credErr) {
    await admin.from("bots").delete().eq("id", bot.id);
    throw new Error("Failed to store credentials");
  }

  let finalRow = bot;
  const photo = await fetchBotProfilePhoto(input.token, me.id);
  if (photo) {
    const path = `bots/${bot.id}/tg-${Date.now()}.jpg`;
    const up = await admin.storage.from(BUCKETS.avatars).upload(path, new Blob([photo as BlobPart], { type: "image/jpeg" }), { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
    if (!up.error) {
      const { data: updated } = await admin.from("bots").update({ avatar_path: path }).eq("id", bot.id).select("*").single();
      if (updated) finalRow = updated;
    } else {
      console.error("[bot-photo] createBot upload failed:", up.error.message);
    }
  }

  await admin.from("activity_logs").insert({ workspace_id: ctx.workspaceId, actor_id: ctx.userId, action: "bot.created", detail: `@${me.username}` });
  await recordBotHistory({
    workspaceId: ctx.workspaceId,
    botId: bot.id as string,
    botName: input.name,
    username: me.username,
    event: "created",
    category: input.category ?? null,
    description: input.description ?? null,
    welcomeMessage: input.welcomeMessage ?? null,
    defaultResponse: input.defaultResponse ?? null,
    messagesCount: 0,
    actorId: ctx.userId,
    actorEmail: ctx.email,
    botCreatedAt: (bot.created_at as string) ?? new Date().toISOString(),
  });
  await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_created", title: `Bot created: ${input.name}`, body: `@${me.username} was added to your workspace.` });
  await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_connected", title: "Telegram bot connected", body: `@${me.username} is connected to RelayNest${photo ? " and its profile photo was imported" : ""}.`, emailKey: "botConnected" });
  return toBotDto(finalRow);
}

async function loadToken(botId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bot_credentials")
    .select("encrypted_token")
    .eq("bot_id", botId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) throw Errors.notFound("Bot credentials");
  return decryptSecret(data.encrypted_token as string, serverEnv().ENCRYPTION_KEY);
}

/** Registers the Telegram webhook with a fresh secret token and marks the bot active. */
export async function activateBot(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  const bot = await getBot(ctx, botId); // verifies workspace ownership
  const token = await loadToken(bot.id, ctx.workspaceId);
  const admin = createAdminClient();
  try {
    if (updatesMode() === "polling") {
      // No public URL: the dev server fetches updates itself (see telegram-polling.ts). Telegram allows only one of webhook or polling.
      await deleteWebhook(token, false);
      const polled = await admin
        .from("bots")
        .update({ status: "active", webhook_status: "polling", webhook_secret_hash: null })
        .eq("id", bot.id)
        .eq("workspace_id", ctx.workspaceId)
        .select("*")
        .single();
      if (polled.error) throw new Error("Failed to activate bot");
      await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_activated", title: `Bot activated: ${bot.name}`, body: "It is now online and answering Telegram messages." });
      return toBotDto(polled.data);
    }
    const secret = randomToken(32);
    const url = `${publicEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/telegram/${bot.publicId}`;
    if (!url.startsWith("https://")) throw Errors.invalid("Telegram webhooks need a public https address. Set NEXT_PUBLIC_APP_URL to your https URL, or set TELEGRAM_UPDATES_MODE=polling for local development.");
    await setWebhook(token, url, secret);
    const { data, error } = await admin
      .from("bots")
      .update({ status: "active", webhook_status: "registered", webhook_secret_hash: await sha256Hex(secret) })
      .eq("id", bot.id)
      .eq("workspace_id", ctx.workspaceId)
      .select("*")
      .single();
    if (error) throw new Error("Failed to activate bot");
    await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_activated", title: `Bot activated: ${bot.name}`, body: "It is now online and answering Telegram messages." });
    return toBotDto(data);
  } catch (err) {
    if (isTelegramBotDeletedError(err)) {
      await markBotDeletedOnTelegram(bot.id, ctx.workspaceId, { userId: ctx.userId, email: ctx.email });
    }
    throw err;
  }
}

export async function deactivateBot(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  const bot = await getBot(ctx, botId);
  const token = await loadToken(bot.id, ctx.workspaceId);
  try {
    await deleteWebhook(token, false);
  } catch (err) {
    if (isTelegramBotDeletedError(err)) {
      const marked = await markBotDeletedOnTelegram(bot.id, ctx.workspaceId, { userId: ctx.userId, email: ctx.email });
      if (marked) return marked;
    }
    throw err;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bots")
    .update({ status: "inactive", webhook_status: "removed", webhook_secret_hash: null })
    .eq("id", bot.id)
    .eq("workspace_id", ctx.workspaceId)
    .select("*")
    .single();
  if (error) throw new Error("Failed to deactivate bot");
  await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_paused", title: `Bot paused: ${bot.name}`, body: "It will not reply to Telegram messages until you activate it again.", emailKey: "botOffline" });
  return toBotDto(data);
}

async function loadBotConfigSnapshot(workspaceId: string, bot: BotDto) {
  const admin = createAdminClient();
  const [cmdsRes, agentRes] = await Promise.allSettled([
    admin.from("bot_commands").select("command").eq("bot_id", bot.id).eq("workspace_id", workspaceId),
    admin
      .from("ai_agents")
      .select("id, category, description, ai_models!ai_agents_model_id_fkey(name)")
      .eq("bot_id", bot.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  const commands =
    cmdsRes.status === "fulfilled" && cmdsRes.value.data ? cmdsRes.value.data.map((c) => `/${c.command as string}`) : [];
  const agentRow = agentRes.status === "fulfilled" ? agentRes.value.data : null;
  const joinedModel = agentRow ? (Array.isArray(agentRow.ai_models) ? agentRow.ai_models[0] : agentRow.ai_models) : null;
  return {
    commands,
    category: bot.category ?? (agentRow?.category as string | null) ?? null,
    description: bot.description ?? (agentRow?.description as string | null) ?? null,
    modelName: (joinedModel as { name?: string } | null)?.name ?? null,
  };
}

/** Clears webhooks, menu commands, descriptions, and profile photo on Telegram when removing a bot from RelayNest. */
export async function cleanupTelegramBotOnDelete(token: string) {
  await Promise.allSettled([
    deleteWebhook(token, true),
    deleteMyCommands(token),
    setMyDescription(token, ""),
    setMyShortDescription(token, ""),
    removeMyProfilePhoto(token),
  ]);
}

export async function deleteBot(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  const bot = await getBot(ctx, botId);
  const admin = createAdminClient();
  const snap = await loadBotConfigSnapshot(ctx.workspaceId, bot);

  try {
    const token = await loadToken(bot.id, ctx.workspaceId);
    await cleanupTelegramBotOnDelete(token);
  } catch {
    // Best effort: bot may already be deleted or token revoked on Telegram.
  }

  await recordBotHistory({
    workspaceId: ctx.workspaceId,
    botId: bot.id,
    botName: bot.name,
    username: bot.username ?? "",
    event: "deleted",
    category: snap.category,
    description: snap.description,
    commands: snap.commands,
    welcomeMessage: bot.welcomeMessage,
    defaultResponse: bot.defaultResponse,
    modelName: snap.modelName,
    messagesCount: bot.messagesCount,
    actorId: ctx.userId,
    actorEmail: ctx.email,
    botCreatedAt: bot.createdAt,
  });

  // Unlink any AI Agent pointing at this bot before removing the bot row.
  await admin.from("ai_agents").update({ bot_id: null, status: "draft" }).eq("bot_id", bot.id).eq("workspace_id", ctx.workspaceId);

  const { error } = await ctx.supabase.from("bots").delete().eq("id", bot.id).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete bot");
  await admin.from("activity_logs").insert({
    workspace_id: ctx.workspaceId,
    actor_id: ctx.userId,
    action: "bot.deleted",
    detail: bot.username ? `@${bot.username}` : bot.name,
  });
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "bot_deleted",
    title: `Bot deleted: ${bot.name}`,
    body: "The bot, its webhook, commands, and Telegram configuration were cleared. Records were saved in Bot History.",
    emailKey: "botOffline",
  });
}

/**
 * Marks a bot as deleted/revoked on Telegram (401/404 from Bot API), records a lifecycle history event,
 * and alerts workspace owners with a critical notification.
 */
export async function markBotDeletedOnTelegram(botId: string, workspaceId: string, actor?: { userId?: string; email?: string | null }): Promise<BotDto | null> {
  const admin = createAdminClient();
  const { data: current } = await admin.from("bots").select(BOT_COLUMNS).eq("id", botId).eq("workspace_id", workspaceId).maybeSingle();
  if (!current) return null;
  const alreadyMarked = current.status === "error" && current.webhook_status === "telegram_deleted";

  const { data: updated, error } = await admin
    .from("bots")
    .update({ status: "error", webhook_status: "telegram_deleted", webhook_secret_hash: null })
    .eq("id", botId)
    .eq("workspace_id", workspaceId)
    .select(BOT_COLUMNS)
    .single();

  await admin.from("ai_agents").update({ status: "error" }).eq("bot_id", botId).eq("workspace_id", workspaceId);

  if (!alreadyMarked) {
    const dto = toBotDto(updated ?? current);
    const snap = await loadBotConfigSnapshot(workspaceId, dto);
    await recordBotHistory({
      workspaceId,
      botId: dto.id,
      botName: dto.name,
      username: dto.username ?? "",
      event: "deleted_on_telegram",
      category: snap.category,
      description: snap.description,
      commands: snap.commands,
      welcomeMessage: dto.welcomeMessage,
      defaultResponse: dto.defaultResponse,
      modelName: snap.modelName,
      messagesCount: dto.messagesCount,
      actorId: actor?.userId ?? null,
      actorEmail: actor?.email ?? null,
      botCreatedAt: dto.createdAt,
    });
    await admin.from("activity_logs").insert({
      workspace_id: workspaceId,
      actor_id: actor?.userId ?? null,
      action: "bot.deleted_on_telegram",
      detail: dto.username ? `@${dto.username}` : dto.name,
    });
    await notifyOwners(workspaceId, {
      kind: "bot_deleted_telegram",
      title: `Bot deleted on Telegram: ${dto.name}`,
      body: `@${dto.username || dto.name} was deleted on Telegram or its token was revoked. Open My Bots to delete it cleanly and recreate a replacement if needed.`,
      dedupeHours: 6,
      emailKey: "botOffline",
    });
    logEvent("backend", "warn", `Telegram bot deleted/revoked externally: ${dto.name}`, { botId });
  }

  return error || !updated ? toBotDto(current) : toBotDto(updated);
}

/** Downloads the bot's current profile photo from Telegram and stores it in Supabase Storage. */
export async function refreshBotPhoto(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  const bot = await getBot(ctx, botId);
  const token = await loadToken(bot.id, ctx.workspaceId);
  const me = await getMe(token);
  const photo = await fetchBotProfilePhoto(token, me.id);
  if (!photo) {
    return { bot, synced: false, message: "No profile photo is set on Telegram for this bot. Set one in @BotFather (/setuserpic) or upload an image here." };
  }
  const admin = createAdminClient();
  const path = `bots/${bot.id}/tg-${Date.now()}.jpg`;
  const up = await admin.storage.from(BUCKETS.avatars).upload(path, new Blob([photo as BlobPart], { type: "image/jpeg" }), { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
  if (up.error) {
    console.error("[bot-photo] refresh upload failed:", up.error.message);
    throw Errors.upstream(`Could not save bot photo: ${up.error.message}`);
  }
  if (bot.avatarPath && bot.avatarPath !== path) void admin.storage.from(BUCKETS.avatars).remove([bot.avatarPath]);
  const { data, error } = await admin.from("bots").update({ avatar_path: path }).eq("id", bot.id).eq("workspace_id", ctx.workspaceId).select("*").single();
  if (error || !data) throw Errors.upstream("Could not update bot photo in database.");
  await admin.from("ai_agents").update({ avatar_path: path }).eq("bot_id", bot.id).eq("workspace_id", ctx.workspaceId);
  return { bot: toBotDto(data), synced: true };
}

/** Decrypts and returns the bot token for workspace owners/admins. */
export async function revealBotToken(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  await getBot(ctx, botId);
  return { token: await loadToken(botId, ctx.workspaceId) };
}

/** Replaces the encrypted bot token after verifying it with Telegram, and re-registers the webhook if active. */
export async function updateBotToken(ctx: AuthContext, botId: string, token: string) {
  requireWrite(ctx);
  const bot = await getBot(ctx, botId);
  const me = await getMe(token);
  const env = serverEnv();
  const encrypted = await encryptSecret(token, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_VERSION);
  const admin = createAdminClient();
  const { error: credErr } = await admin
    .from("bot_credentials")
    .update({ encrypted_token: encrypted, key_version: env.ENCRYPTION_KEY_VERSION })
    .eq("bot_id", bot.id)
    .eq("workspace_id", ctx.workspaceId);
  if (credErr) throw new Error("Failed to update token");
  const { data, error } = await admin
    .from("bots")
    .update({
      telegram_bot_id: String(me.id),
      telegram_username: me.username,
      ...(bot.webhookStatus === "telegram_deleted" ? { status: "inactive", webhook_status: "removed" } : {}),
    })
    .eq("id", bot.id)
    .eq("workspace_id", ctx.workspaceId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Failed to update bot");
  if (bot.status === "active") return activateBot(ctx, bot.id);
  return toBotDto(data);
}

/** Re-verifies a single bot against Telegram (`getMe`, photo, webhook state) and syncs deleted/revoked bots cleanly. */
export async function syncBotWithTelegram(
  ctx: AuthContext,
  botId: string,
  opts?: { timeoutMs?: number },
): Promise<{ bot: BotDto; telegramDeleted: boolean }> {
  const bot = await getBot(ctx, botId);
  const token = await loadToken(bot.id, ctx.workspaceId);
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  let me;
  try {
    me = await getMe(token, timeoutMs);
  } catch (err) {
    if (isTelegramBotDeletedError(err)) {
      const marked = await markBotDeletedOnTelegram(bot.id, ctx.workspaceId, { userId: ctx.userId, email: ctx.email });
      return { bot: marked ?? { ...bot, status: "error", webhookStatus: "telegram_deleted" }, telegramDeleted: true };
    }
    throw err;
  }

  const admin = createAdminClient();
  let avatarPath = bot.avatarPath;
  if (!avatarPath) {
    const photo = await fetchBotProfilePhoto(token, me.id);
    if (photo) {
      const path = `bots/${bot.id}/tg-${Date.now()}.jpg`;
      const up = await admin.storage.from(BUCKETS.avatars).upload(path, new Blob([photo as BlobPart], { type: "image/jpeg" }), { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
      if (!up.error) avatarPath = path;
    }
  }

  const patch: Record<string, unknown> = {
    telegram_bot_id: String(me.id),
    telegram_username: me.username,
    avatar_path: avatarPath,
  };
  if (bot.webhookStatus === "telegram_deleted") {
    patch.status = "inactive";
    patch.webhook_status = "removed";
  } else if (bot.status === "active" && updatesMode() === "webhook") {
    try {
      const info = await getWebhookInfo(token, timeoutMs);
      if (!info.url) {
        patch.webhook_status = "pending";
        patch.status = "inactive";
      }
    } catch (e) {
      if (isTelegramBotDeletedError(e)) {
        const marked = await markBotDeletedOnTelegram(bot.id, ctx.workspaceId, { userId: ctx.userId, email: ctx.email });
        return { bot: marked ?? { ...bot, status: "error", webhookStatus: "telegram_deleted" }, telegramDeleted: true };
      }
    }
  }

  const { data, error } = await admin
    .from("bots")
    .update(patch)
    .eq("id", bot.id)
    .eq("workspace_id", ctx.workspaceId)
    .select(BOT_COLUMNS)
    .single();
  if (error || !data) throw new Error("Failed to update bot");
  if (me.username) {
    await admin.from("ai_agents").update({ username: me.username }).eq("bot_id", bot.id).eq("workspace_id", ctx.workspaceId);
  }
  return { bot: toBotDto(data), telegramDeleted: false };
}

/** Syncs all bots in a workspace with Telegram (`getMe`). Never throws on offline network; detects Telegram deletions cleanly. */
export async function syncWorkspaceBotsWithTelegram(
  ctx: AuthContext,
  opts?: { timeoutMs?: number },
): Promise<{ id: string; telegramDeleted: boolean; error?: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("bots").select("id").eq("workspace_id", ctx.workspaceId).limit(50);
  const ids = (data ?? []).map((r) => r.id as string);
  const timeoutMs = opts?.timeoutMs ?? 3_500;
  return Promise.all(
    ids.map(async (id) => {
      try {
        const res = await syncBotWithTelegram(ctx, id, { timeoutMs });
        return { id, telegramDeleted: res.telegramDeleted };
      } catch (e) {
        return { id, telegramDeleted: false, error: e instanceof Error ? e.message : "Sync skipped" };
      }
    }),
  );
}

/** Re-verifies the bot token with Telegram getMe, syncs username/photo, or marks it deleted on Telegram. */
export async function revalidateBot(ctx: AuthContext, botId: string) {
  requireWrite(ctx);
  const res = await syncBotWithTelegram(ctx, botId);
  return res.bot;
}

/** Updates bot fields in Supabase and best-effort syncs name/description to Telegram. */
export async function updateBotDetails(
  ctx: AuthContext,
  botId: string,
  input: { name?: string; description?: string; category?: string; welcomeMessage?: string; defaultResponse?: string; avatarPath?: string | null; status?: string },
) {
  requireWrite(ctx);
  const existing = await getBot(ctx, botId);
  if (input.avatarPath && !input.avatarPath.startsWith(`${ctx.userId}/`) && !input.avatarPath.startsWith(`bots/${botId}/`)) {
    throw Errors.forbidden();
  }
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.welcomeMessage !== undefined) patch.welcome_message = input.welcomeMessage;
  if (input.defaultResponse !== undefined) patch.default_response = input.defaultResponse;
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await ctx.supabase
    .from("bots")
    .update(patch)
    .eq("id", botId)
    .eq("workspace_id", ctx.workspaceId)
    .select(BOT_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[bots] updateBotDetails failed:", error?.message);
    throw Errors.upstream(error?.message ? `Could not update bot: ${error.message}` : "Failed to update bot.");
  }

  // Keep any linked AI Agent in sync with bot name/description/avatar/responses.
  const agentPatch: Record<string, unknown> = {};
  if (input.name !== undefined) agentPatch.name = input.name;
  if (input.description !== undefined) agentPatch.description = input.description;
  if (input.avatarPath !== undefined) agentPatch.avatar_path = input.avatarPath;
  if (input.welcomeMessage !== undefined) agentPatch.welcome_message = input.welcomeMessage;
  if (input.defaultResponse !== undefined) agentPatch.fallback_message = input.defaultResponse;
  if (Object.keys(agentPatch).length > 0) {
    await createAdminClient().from("ai_agents").update(agentPatch).eq("bot_id", botId).eq("workspace_id", ctx.workspaceId);
  }

  if (input.name !== undefined || input.description !== undefined || input.avatarPath !== undefined) {
    try {
      const token = await loadToken(botId, ctx.workspaceId);
      if (input.name !== undefined && input.name !== existing.name) await setMyName(token, input.name);
      if (input.description !== undefined && input.description !== existing.description) await setMyDescription(token, input.description);
      if (input.avatarPath !== undefined && input.avatarPath !== existing.avatarPath) {
        if (input.avatarPath === null) {
          await removeMyProfilePhoto(token);
        } else {
          const { data: fileBlob } = await createAdminClient().storage.from(BUCKETS.avatars).download(input.avatarPath);
          if (fileBlob) {
            const bytes = new Uint8Array(await fileBlob.arrayBuffer());
            await setMyProfilePhoto(token, bytes, fileBlob.type || "image/jpeg");
          }
        }
      }
    } catch (e) {
      console.error("[bots] Telegram sync warning:", e instanceof Error ? e.message : e);
    }
  }
  const photoChanged = input.avatarPath !== undefined && input.avatarPath !== existing.avatarPath;
  const textChanged = input.name !== undefined || input.description !== undefined || input.category !== undefined || input.welcomeMessage !== undefined || input.defaultResponse !== undefined;
  if (photoChanged) await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_photo_updated", title: `Bot photo updated: ${data.name as string}`, body: "The new picture was saved and sent to Telegram.", dedupeHours: 0.01 });
  if (textChanged) await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "bot_updated", title: `Bot updated: ${data.name as string}`, body: "Your changes were saved and synced with Telegram.", dedupeHours: 0.01 });
  return toBotDto(data);
}

/** Sends a real Telegram message when chatId is provided, or simulates the bot's reply from DB commands/responses. */
export async function testBot(ctx: AuthContext, botId: string, input: { chatId?: string; message: string }) {
  requireWrite(ctx);
  await assertExecutionLimit(ctx.workspaceId);
  const bot = await getBot(ctx, botId);
  if (input.chatId?.trim()) {
    const token = await loadToken(bot.id, ctx.workspaceId);
    try {
      await sendMessage(token, input.chatId.trim(), input.message);
    } catch (err) {
      if (isTelegramBotDeletedError(err)) {
        await markBotDeletedOnTelegram(bot.id, ctx.workspaceId, { userId: ctx.userId, email: ctx.email });
      }
      throw err;
    }
    return { sent: true, mode: "telegram" as const, reply: input.message };
  }
  const text = input.message.trim();
  if (text.startsWith("/")) {
    const cmd = text.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
    const { data: cmds } = await ctx.supabase
      .from("bot_commands")
      .select("command, response_config, enabled")
      .eq("bot_id", bot.id)
      .eq("workspace_id", ctx.workspaceId)
      .eq("enabled", true);
    const hit = (cmds ?? []).find((c) => (c.command as string).toLowerCase() === cmd);
    const hitText = (hit?.response_config as { text?: string } | null)?.text;
    if (hitText) return { sent: false, mode: "simulate" as const, reply: hitText };
    if (cmd === "start" && bot.welcomeMessage) return { sent: false, mode: "simulate" as const, reply: bot.welcomeMessage };
  }
  return { sent: false, mode: "simulate" as const, reply: bot.defaultResponse || bot.welcomeMessage || "No default response configured yet." };
}

export { loadToken };
