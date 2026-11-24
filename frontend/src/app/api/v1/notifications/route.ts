import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { notify } from "@backend/server/notifications";

/** Account events the browser reports itself (these changes are saved straight to Supabase from the page). */
const EVENTS = {
  login_detected: { title: "New sign-in detected", body: "You signed in to your RelayNest account.", emailKey: "login" },
  profile_updated: { title: "Profile updated", body: "Your profile details were saved.", emailKey: undefined },
  workspace_updated: { title: "Workspace updated", body: "Your workspace settings were saved.", emailKey: undefined },
  password_changed: { title: "Password changed", body: "Your account password was updated.", emailKey: "accountSecurity" },
} as const;

const input = z.union([
  z.object({ readAll: z.literal(true) }),
  z.object({ id: z.string().uuid() }),
  z.object({ event: z.enum(Object.keys(EVENTS) as [keyof typeof EVENTS, ...(keyof typeof EVENTS)[]]) }),
]);

/** Latest notifications for the signed-in member (or scoped API key owner) plus the unread count. */
export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "notifications:read", async (ctx) => {
    const [list, unread] = await Promise.all([
      ctx.supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
        .order("created_at", { ascending: false })
        .limit(20),
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
    const body = input.parse(await readJson(req));
    if ("event" in body) {
      const e = EVENTS[body.event];
      await notify({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        kind: body.event,
        title: e.title,
        body: e.body,
        emailKey: e.emailKey,
        dedupeHours: body.event === "login_detected" ? 1 : 0.02,
      });
      return ok({ done: true }, {}, 200, requestId);
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
