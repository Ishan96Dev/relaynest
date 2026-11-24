import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { refreshBotPhoto } from "@backend/server/services/bots";

/** Re-reads the bot's profile photo from Telegram and stores it. The photo itself is set in @BotFather (/setuserpic). */
export const POST = route<{ params: Promise<{ botId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`bot-photo:${ctx.userId}`, 10, 60_000);
  return ok(await refreshBotPhoto(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});
