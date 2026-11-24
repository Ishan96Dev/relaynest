import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAdmin } from "@backend/server/admin/auth";
import { clearConsoleLogs, getAdminLogsData, logEvent } from "@backend/server/admin/console";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams;
  const section = q.get("section") ?? "all";
  const level = q.get("level") ?? "all";
  return ok(await getAdminLogsData(section, level), {}, 200, requestId);
});

export const DELETE = route(async (_req, _ctx, requestId) => {
  await requireAdmin();
  clearConsoleLogs();
  return ok({ cleared: true }, {}, 200, requestId);
});

const ingestSchema = z.object({
  level: z.enum(["info", "warn", "error"]).default("error"),
  message: z.string().trim().min(1).max(500),
  path: z.string().trim().max(200).optional(),
});

/** Allows the browser error boundary to report frontend runtime logs into the Admin console. */
export const POST = route(async (req, _ctx, requestId) => {
  const body = ingestSchema.parse(await readJson(req));
  logEvent("frontend", body.level, body.message, body.path ? { path: body.path } : undefined);
  return ok({ logged: true }, {}, 200, requestId);
});
