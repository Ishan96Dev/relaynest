import "server-only";
import { Errors } from "@backend/lib/http/api";
import type { AuthContext } from "@backend/server/auth/context";

export const BOT_COLUMNS =
  "id, public_id, name, description, category, telegram_username, avatar_path, status, webhook_status, welcome_message, default_response, messages_count, last_update_at, created_at";

export interface BotDto {
  id: string;
  publicId: string;
  name: string;
  description: string | null;
  category: string | null;
  username: string | null;
  avatarPath: string | null;
  status: "draft" | "active" | "inactive" | "error";
  webhookStatus: string;
  welcomeMessage: string | null;
  defaultResponse: string | null;
  messagesCount: number;
  lastUpdateAt: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;

/** Maps a DB row to a safe DTO. Credentials and webhook secrets are never selected. */
export function toBotDto(r: Row): BotDto {
  return {
    id: r.id as string,
    publicId: r.public_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    username: (r.telegram_username as string | null) ?? null,
    avatarPath: (r.avatar_path as string | null) ?? null,
    status: r.status as BotDto["status"],
    webhookStatus: r.webhook_status as string,
    welcomeMessage: (r.welcome_message as string | null) ?? null,
    defaultResponse: (r.default_response as string | null) ?? null,
    messagesCount: Number(r.messages_count ?? 0),
    lastUpdateAt: (r.last_update_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function listBots(ctx: AuthContext, opts: { limit: number; cursor?: string; search?: string; status?: string }) {
  let q = ctx.supabase
    .from("bots")
    .select(BOT_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search) q = q.ilike("name", `%${opts.search.replace(/[%_]/g, "\\$&")}%`);
  if (opts.cursor) q = q.lt("created_at", Buffer.from(opts.cursor, "base64url").toString());
  const { data, error } = await q;
  if (error) throw new Error("Failed to list bots");
  const rows = data ?? [];
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    bots: page.map(toBotDto),
    hasMore,
    nextCursor: hasMore && last ? Buffer.from(String(last.created_at)).toString("base64url") : null,
  };
}

export async function getBot(ctx: AuthContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("bots")
    .select(BOT_COLUMNS)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) throw new Error("Failed to load bot");
  if (!data) throw Errors.notFound("Bot");
  return toBotDto(data);
}
