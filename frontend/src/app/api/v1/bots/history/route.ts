import { ok, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { listBotHistory } from "@backend/server/services/bot-history";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "bots:read", async (ctx) => ok(await listBotHistory(ctx), {}, 200, requestId)),
);
