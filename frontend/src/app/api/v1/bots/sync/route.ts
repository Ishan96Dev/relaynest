import { ok, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { withApiAccess } from "@backend/server/auth/context";
import { listBots } from "@backend/server/repositories/bots";
import { syncWorkspaceBotsWithTelegram } from "@backend/server/services/bots";

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "bots:write", async (ctx) => {
    rateLimit(`bots-sync:${ctx.workspaceId}`, 20, 60_000);
    const results = await syncWorkspaceBotsWithTelegram(ctx);
    const latest = await listBots(ctx, { limit: 50 });
    return ok({ bots: latest.bots, syncResults: results }, {}, 200, requestId);
  }),
);
