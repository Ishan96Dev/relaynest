import { ok, readJson, route } from "@backend/lib/http/api";
import { botResponsesUpdateInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { listBotResponses, saveBotResponses } from "@backend/server/repositories/responses";

type Ctx = { params: Promise<{ botId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await listBotResponses(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});

export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = botResponsesUpdateInput.parse(await readJson(req));
  return ok(await saveBotResponses(ctx, uuid.parse((await params).botId), input), {}, 200, requestId);
});
