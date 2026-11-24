import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { revalidateBot } from "@backend/server/services/bots";

export const POST = route<{ params: Promise<{ botId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`bot-revalidate:${ctx.userId}`, 15, 60_000);
  return ok(await revalidateBot(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});
