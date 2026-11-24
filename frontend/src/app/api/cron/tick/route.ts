import { safeEqual } from "@backend/lib/crypto";
import { cronSecret } from "@backend/lib/env/integrations";
import { runDueSchedules } from "@backend/server/services/scheduler";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
/**
 * Runs due automation schedules. Protected by CRON_SECRET (send `Authorization: Bearer <CRON_SECRET>`).
 * Point a Cloudflare Cron Trigger, or any scheduler, at this URL once a minute.
 */
async function handle(req: Request) {
  const secret = cronSecret();
  const given = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || !given || !safeEqual(given, secret)) return new Response(null, { status: 401 });
  return Response.json({ data: await runDueSchedules() });
}
export { handle as GET, handle as POST };
