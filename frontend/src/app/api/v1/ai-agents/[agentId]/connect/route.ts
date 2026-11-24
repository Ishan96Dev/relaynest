import { ok, readJson, route } from "@backend/lib/http/api";
import { connectInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { connectTelegram } from "@backend/server/services/ai-agents";

type Ctx = { params: Promise<{ agentId: string }> };

/** Creates the Telegram bot for this agent from a BotFather token. The token is encrypted and never returned. */
export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const { token } = connectInput.parse(await readJson(req));
  return ok(await connectTelegram(ctx, uuid.parse((await params).agentId), token), {}, 200, requestId);
});
