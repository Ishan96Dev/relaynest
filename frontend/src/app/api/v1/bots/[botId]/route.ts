import { ok, readJson, route } from "@backend/lib/http/api";
import { updateBotInput, uuid } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { getBot } from "@backend/server/repositories/bots";
import { deleteBot, updateBotDetails } from "@backend/server/services/bots";
import { dispatchWorkspaceEvent } from "@backend/server/services/integrations";

type Ctx = { params: Promise<{ botId: string }> };

export const GET = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "bots:read", async (ctx) => ok(await getBot(ctx, uuid.parse((await params).botId)), {}, 200, requestId)),
);

export const PATCH = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "bots:write", async (ctx) => {
    const id = uuid.parse((await params).botId);
    const input = updateBotInput.parse(await readJson(req));
    return ok(await updateBotDetails(ctx, id, input), {}, 200, requestId);
  }),
);

export const DELETE = route<Ctx>(async (req, { params }) =>
  withApiAccess(req, "bots:write", async (ctx) => {
    const id = uuid.parse((await params).botId);
    await deleteBot(ctx, id);
    void dispatchWorkspaceEvent(ctx.workspaceId, "bot.deleted", `Bot ${id} was removed from RelayNest and Telegram.`);
    return new Response(null, { status: 204 });
  }),
);
