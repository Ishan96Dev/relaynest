import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { activateBot } from "@backend/server/services/bots";

export const POST = route<{ params: Promise<{ botId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await activateBot(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});
