import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { INAPP_NOTIFICATION_KEYS, type EmailNotificationKey, type InAppNotificationKey } from "@backend/lib/notifications";
import { withApiAccess } from "@backend/server/auth/context";
import { notify } from "@backend/server/notifications";

/** Account events the browser reports itself (these changes are saved straight to Supabase from the page). */
const EVENTS: Record<
  "login_detected" | "profile_updated" | "workspace_updated" | "password_changed" | "sessions_revoked",
  { title: string; body: string; emailKey?: EmailNotificationKey; actionUrl: string }
> = {
  login_detected: {
    title: "New sign-in detected",
    body: "You signed in to your RelayNest account.",
    emailKey: "login",
    actionUrl: "/settings/security",
  },
  profile_updated: {
    title: "Profile updated",
    body: "Your profile details were saved.",
    actionUrl: "/settings/profile",
  },
  workspace_updated: {
    title: "Workspace updated",
    body: "Your workspace settings were saved.",
    actionUrl: "/settings/workspace",
  },
  password_changed: {
    title: "Password changed",
    body: "Your account password was updated.",
    emailKey: "accountSecurity",
    actionUrl: "/settings/security",
  },
  sessions_revoked: {
    title: "Other sessions signed out",
    body: "All other active devices were signed out of your RelayNest account.",
    emailKey: "accountSecurity",
    actionUrl: "/settings/security",
  },
};

const eventKeys = Object.keys(EVENTS) as [keyof typeof EVENTS, ...(keyof typeof EVENTS)[]];

const postInput = z.union([
  z.object({ readAll: z.literal(true) }),
  z.object({ id: z.string().uuid() }),
  z.object({
    event: z.enum(eventKeys),
    detail: z.string().trim().max(240).optional(),
  }),
]);

const deleteInput = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ clearRead: z.literal(true) }),
  z.object({ clearAll: z.literal(true) }),
]);

const categorySet = new Set<string>(INAPP_NOTIFICATION_KEYS);

/** Latest notifications for the signed-in member (or scoped API key owner) plus the unread count. */
export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "notifications:read", async (ctx) => {
    const url = new URL(req.url);
    const rawCategory = url.searchParams.get("category");
    const category = rawCategory && categorySet.has(rawCategory) ? (rawCategory as InAppNotificationKey) : null;
    const unreadOnly = url.searchParams.get("unreadOnly") === "1" || url.searchParams.get("unreadOnly") === "true";
    const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 25;

    let listQuery = ctx.supabase
      .from("notifications")
      .select("id, kind, category, title, body, action_url, read_at, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) listQuery = listQuery.eq("category", category);
    if (unreadOnly) listQuery = listQuery.is("read_at", null);

    const [list, unread] = await Promise.all([
      listQuery,
      ctx.supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspaceId)
        .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
        .is("read_at", null),
    ]);

    return ok({ items: list.data ?? [], unread: unread.count ?? 0 }, {}, 200, requestId);
  }),
);

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "notifications:read", async (ctx) => {
    const body = postInput.parse(await readJson(req));
    if ("event" in body) {
      const e = EVENTS[body.event];
      const result = await notify({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        kind: body.event,
        title: e.title,
        body: body.detail || e.body,
        emailKey: e.emailKey,
        actionUrl: e.actionUrl,
        dedupeHours: body.event === "login_detected" ? 1 : 0.02,
      });
      return ok({ done: true, delivered: result.inapp || result.email, ...result }, {}, 200, requestId);
    }
    const q = ctx.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", ctx.workspaceId)
      .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
      .is("read_at", null);
    await ("id" in body ? q.eq("id", body.id) : q);
    return ok({ done: true }, {}, 200, requestId);
  }),
);

/** Dismiss a single notification or clear read/all personal notifications for the signed-in user. */
export const DELETE = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "notifications:read", async (ctx) => {
    const body = deleteInput.parse(await readJson(req));
    let q = ctx.supabase
      .from("notifications")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId);

    if ("id" in body) {
      q = q.eq("id", body.id);
    } else if ("clearRead" in body) {
      q = q.not("read_at", "is", null);
    }

    await q;
    return ok({ done: true }, {}, 200, requestId);
  }),
);
