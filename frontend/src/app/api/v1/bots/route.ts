import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { createBotInput, paginationInput } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { listBots } from "@backend/server/repositories/bots";
import { createBot } from "@backend/server/services/bots";
import { dispatchWorkspaceEvent } from "@backend/server/services/integrations";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "bots:read", async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const q = paginationInput.extend({ search: z.string().max(100).optional(), status: z.enum(["draft", "active", "inactive", "error"]).optional() })
      .parse(Object.fromEntries(sp));
    const r = await listBots(ctx, q);
    return ok(r.bots, { nextCursor: r.nextCursor, hasMore: r.hasMore }, 200, requestId);
  }),
);

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "bots:write", async (ctx) => {
    const input = createBotInput.parse(await readJson(req));
    const created = await createBot(ctx, input);
    void dispatchWorkspaceEvent(ctx.workspaceId, "bot.created", `Bot "${created.name}" (@${created.username ?? "telegram"}) was created.`);
    return ok(created, {}, 201, requestId);
  }),
);
