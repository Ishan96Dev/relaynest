import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import type { AuthContext } from "@backend/server/auth/context";

export type BotHistoryEvent = "created" | "updated" | "deleted" | "deleted_on_telegram";

export interface BotHistoryEntry {
  id: string;
  botId: string | null;
  botName: string;
  username: string;
  event: BotHistoryEvent;
  usedFor: string;
  category: string;
  description: string;
  commands: string[];
  welcomeMessage: string;
  defaultResponse: string;
  modelName: string | null;
  messagesCount: number;
  botCreatedAt: string | null;
  occurredAt: string;
}

export interface RecordBotHistoryInput {
  workspaceId: string;
  botId: string | null;
  botName: string;
  username: string;
  event: BotHistoryEvent;
  usedFor?: string;
  category?: string | null;
  description?: string | null;
  commands?: string[];
  welcomeMessage?: string | null;
  defaultResponse?: string | null;
  modelName?: string | null;
  messagesCount?: number;
  actorId?: string | null;
  actorEmail?: string | null;
  botCreatedAt?: string | null;
}

function summarizeUsedFor(input: { category?: string | null; description?: string | null; modelName?: string | null; commands?: string[] }) {
  const parts: string[] = [];
  if (input.category?.trim()) parts.push(input.category.trim());
  if (input.modelName?.trim()) parts.push(`AI (${input.modelName.trim()})`);
  if (input.description?.trim()) parts.push(input.description.trim());
  if (!parts.length && input.commands?.length) parts.push(`${input.commands.length} configured commands`);
  return parts.join(" · ") || "General Telegram automation & messaging";
}

/**
 * Persists a full bot lifecycle snapshot (creation, manual deletion, or external Telegram deletion)
 * including what the bot was used for and its configuration. Writes both to the dedicated `bot_history`
 * table (when migrated) and structured `user_audit_logs` fallback so history is never lost.
 */
export async function recordBotHistory(input: RecordBotHistoryInput): Promise<void> {
  const usedFor = input.usedFor?.trim() || summarizeUsedFor(input);
  const commands = input.commands ?? [];
  const configSnapshot = {
    botId: input.botId,
    botName: input.botName,
    username: input.username,
    usedFor,
    category: input.category ?? "",
    description: input.description ?? "",
    commands,
    welcomeMessage: input.welcomeMessage ?? "",
    defaultResponse: input.defaultResponse ?? "",
    modelName: input.modelName ?? null,
    messagesCount: input.messagesCount ?? 0,
    botCreatedAt: input.botCreatedAt ?? null,
  };

  const admin = createAdminClient();
  const occurredAt = new Date().toISOString();

  await Promise.allSettled([
    admin.from("bot_history").insert({
      workspace_id: input.workspaceId,
      bot_id: input.botId,
      bot_name: input.botName,
      telegram_username: input.username || null,
      event: input.event,
      used_for: usedFor,
      category: input.category ?? null,
      description: input.description ?? null,
      config_snapshot: configSnapshot,
      messages_count: input.messagesCount ?? 0,
      actor_id: input.actorId ?? null,
      bot_created_at: input.botCreatedAt ?? null,
      occurred_at: occurredAt,
    }),
    admin.from("user_audit_logs").insert({
      user_id: input.actorId ?? null,
      user_email: input.actorEmail ?? "system@relaynest.local",
      workspace_id: input.workspaceId,
      event: `bot.history.${input.event}`,
      page_path: "/bots",
      detail: JSON.stringify(configSnapshot).slice(0, 3500),
      created_at: occurredAt,
    }),
  ]);
}

function parseJsonSnapshot(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim().startsWith("{")) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Loads chronological created/deleted/Telegram-removed bot history for the active workspace. */
export async function listBotHistory(ctx: AuthContext): Promise<BotHistoryEntry[]> {
  const admin = createAdminClient();
  const entries = new Map<string, BotHistoryEntry>();

  const [histRes, auditRes, liveBotsRes, liveAgentsRes] = await Promise.allSettled([
    admin
      .from("bot_history")
      .select("id, bot_id, bot_name, telegram_username, event, used_for, category, description, config_snapshot, messages_count, bot_created_at, occurred_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    admin
      .from("user_audit_logs")
      .select("id, event, detail, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .like("event", "bot.history.%")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("bots")
      .select("id, name, telegram_username, category, description, welcome_message, default_response, messages_count, created_at, bot_commands(command)")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("ai_agents")
      .select("bot_id, category, description, commands, ai_models!ai_agents_model_id_fkey(name)")
      .eq("workspace_id", ctx.workspaceId)
      .not("bot_id", "is", null),
  ]);

  if (histRes.status === "fulfilled" && !histRes.value.error && histRes.value.data) {
    for (const r of histRes.value.data) {
      const snap = parseJsonSnapshot(r.config_snapshot) ?? {};
      const entry: BotHistoryEntry = {
        id: r.id as string,
        botId: (r.bot_id as string | null) ?? null,
        botName: r.bot_name as string,
        username: (r.telegram_username as string | null) ?? String(snap.username ?? ""),
        event: r.event as BotHistoryEvent,
        usedFor: (r.used_for as string) || summarizeUsedFor({ category: r.category as string | null, description: r.description as string | null }),
        category: (r.category as string | null) ?? String(snap.category ?? ""),
        description: (r.description as string | null) ?? String(snap.description ?? ""),
        commands: Array.isArray(snap.commands) ? snap.commands.map(String) : [],
        welcomeMessage: String(snap.welcomeMessage ?? ""),
        defaultResponse: String(snap.defaultResponse ?? ""),
        modelName: typeof snap.modelName === "string" ? snap.modelName : null,
        messagesCount: Number(r.messages_count ?? 0),
        botCreatedAt: (r.bot_created_at as string | null) ?? null,
        occurredAt: r.occurred_at as string,
      };
      const dedupeKey = `${entry.event}:${entry.botId ?? entry.botName}:${entry.occurredAt.slice(0, 16)}`;
      entries.set(dedupeKey, entry);
    }
  }

  if (auditRes.status === "fulfilled" && !auditRes.value.error && auditRes.value.data) {
    for (const r of auditRes.value.data) {
      const snap = parseJsonSnapshot(r.detail);
      if (!snap) continue;
      const ev = String(r.event).replace("bot.history.", "") as BotHistoryEvent;
      if (!["created", "updated", "deleted", "deleted_on_telegram"].includes(ev)) continue;
      const botId = typeof snap.botId === "string" ? snap.botId : null;
      const botName = String(snap.botName ?? "Telegram Bot");
      const occurredAt = r.created_at as string;
      const dedupeKey = `${ev}:${botId ?? botName}:${occurredAt.slice(0, 16)}`;
      if (entries.has(dedupeKey)) continue;
      entries.set(dedupeKey, {
        id: r.id as string,
        botId,
        botName,
        username: String(snap.username ?? ""),
        event: ev,
        usedFor: String(snap.usedFor ?? ""),
        category: String(snap.category ?? ""),
        description: String(snap.description ?? ""),
        commands: Array.isArray(snap.commands) ? snap.commands.map(String) : [],
        welcomeMessage: String(snap.welcomeMessage ?? ""),
        defaultResponse: String(snap.defaultResponse ?? ""),
        modelName: typeof snap.modelName === "string" ? snap.modelName : null,
        messagesCount: Number(snap.messagesCount ?? 0),
        botCreatedAt: typeof snap.botCreatedAt === "string" ? snap.botCreatedAt : null,
        occurredAt,
      });
    }
  }

  // Ensure existing bots created before history logging still show their creation + configuration record
  // and persist the missing `created` row into `public.bot_history` so Supabase stays complete.
  const recordedCreatedIds = new Set([...entries.values()].filter((e) => e.event === "created" && e.botId).map((e) => e.botId!));
  const agentMap = new Map<string, { category: string; description: string; modelName: string | null; commands: string[] }>();
  if (liveAgentsRes.status === "fulfilled" && liveAgentsRes.value.data) {
    for (const a of liveAgentsRes.value.data) {
      const m = Array.isArray(a.ai_models) ? a.ai_models[0] : a.ai_models;
      const agentCmds = Array.isArray(a.commands)
        ? (a.commands as { command?: string }[]).filter((c) => c.command).map((c) => `/${String(c.command)}`)
        : [];
      if (a.bot_id) {
        agentMap.set(a.bot_id as string, {
          category: (a.category as string | null) ?? "",
          description: (a.description as string | null) ?? "",
          modelName: (m as { name?: string } | null)?.name ?? null,
          commands: agentCmds,
        });
      }
    }
  }

  if (liveBotsRes.status === "fulfilled" && liveBotsRes.value.data) {
    for (const b of liveBotsRes.value.data) {
      const id = b.id as string;
      if (recordedCreatedIds.has(id)) continue;
      const agent = agentMap.get(id);
      const dbCmds = ((b.bot_commands ?? []) as { command: string }[]).map((c) => `/${c.command}`);
      const cmds = [...new Set([...dbCmds, ...(agent?.commands ?? [])])];
      const category = (b.category as string | null) ?? agent?.category ?? "";
      const description = (b.description as string | null) ?? agent?.description ?? "";
      const usedFor = summarizeUsedFor({ category, description, modelName: agent?.modelName, commands: cmds });
      const createdAt = b.created_at as string;
      void recordBotHistory({
        workspaceId: ctx.workspaceId,
        botId: id,
        botName: b.name as string,
        username: (b.telegram_username as string | null) ?? "",
        event: "created",
        usedFor,
        category: category || null,
        description: description || null,
        commands: cmds,
        welcomeMessage: (b.welcome_message as string | null) ?? null,
        defaultResponse: (b.default_response as string | null) ?? null,
        modelName: agent?.modelName ?? null,
        messagesCount: Number(b.messages_count ?? 0),
        actorId: ctx.userId,
        actorEmail: ctx.email,
        botCreatedAt: createdAt,
      }).catch(() => undefined);
      entries.set(`created:${id}:seed`, {
        id: `seed-${id}`,
        botId: id,
        botName: b.name as string,
        username: (b.telegram_username as string | null) ?? "",
        event: "created",
        usedFor,
        category,
        description,
        commands: cmds,
        welcomeMessage: (b.welcome_message as string | null) ?? "",
        defaultResponse: (b.default_response as string | null) ?? "",
        modelName: agent?.modelName ?? null,
        messagesCount: Number(b.messages_count ?? 0),
        botCreatedAt: createdAt,
        occurredAt: createdAt,
      });
    }
  }

  return [...entries.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
