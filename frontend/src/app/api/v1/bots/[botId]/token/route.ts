import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid, validateTokenInput } from "@backend/lib/validation/schemas";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { revealBotToken, updateBotToken } from "@backend/server/services/bots";

type Ctx = { params: Promise<{ botId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`bot-token-read:${ctx.userId}`, 20, 60_000);
  return ok(await revealBotToken(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});

export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`bot-token-write:${ctx.userId}`, 10, 60_000);
  const { token } = validateTokenInput.parse(await readJson(req));
  return ok(await updateBotToken(ctx, uuid.parse((await params).botId), token), {}, 200, requestId);
});
