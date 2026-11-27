import { ok, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { withApiAccess } from "@backend/server/auth/context";
import { listBots } from "@backend/server/repositories/bots";
import { syncWorkspaceBotsWithTelegram } from "@backend/server/services/bots";
import { getBotUsageStats } from "@backend/server/services/execution-trace";

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "bots:write", async (ctx) => {
    rateLimit(`bots-sync:${ctx.workspaceId}`, 20, 60_000);
    const results = await syncWorkspaceBotsWithTelegram(ctx);
    const latest = await listBots(ctx, { limit: 50 });
    const usageMap = await getBotUsageStats(ctx, latest.bots.map((b) => b.id));
    const bots = latest.bots.map((b) => {
      const u = usageMap.get(b.id) ?? { executionsCount: 0, activeUsers: 0 };
      return {
        ...b,
        messagesCount: Math.max(b.messagesCount, u.executionsCount),
        activeUsers: u.activeUsers,
        executionsCount: u.executionsCount,
      };
    });
    return ok({ bots, syncResults: results }, {}, 200, requestId);
  }),
);
