import { ok, readJson, route } from "@backend/lib/http/api";
import { connectInput } from "@backend/lib/validation/schemas";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { createAgentFromToken } from "@backend/server/services/ai-agents";

/** Step 1 of the AI Agent journey: connect the BotFather token first and create the agent from the bot's Telegram identity. */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`agent-connect-new:${ctx.userId}`, 10, 60_000);
  const { token } = connectInput.parse(await readJson(req));
  return ok(await createAgentFromToken(ctx, token), {}, 200, requestId);
});
