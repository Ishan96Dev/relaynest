import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { recordUserAudit } from "@backend/server/audit";

const schema = z.object({
  event: z.enum(["page.view", "auth.login", "auth.logout", "session.timeout", "session.expired", "ui.action"]),
  pagePath: z.string().trim().max(240).optional(),
  detail: z.string().trim().max(240).optional(),
});

/** Records user movements inside RelayNest (page views, logins, timeouts, actions) into `user_audit_logs`. */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const body = schema.parse(await readJson(req));
  await recordUserAudit({
    userId: ctx.userId,
    userEmail: ctx.email,
    workspaceId: ctx.workspaceId,
    event: body.event,
    pagePath: body.pagePath,
    detail: body.detail,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip"),
    userAgent: req.headers.get("user-agent"),
  });
  return ok({ recorded: true }, {}, 200, requestId);
});
