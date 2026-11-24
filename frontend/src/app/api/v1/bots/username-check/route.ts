import { ok, route } from "@backend/lib/http/api";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { botUsernameProblem, checkBotUsername, suggestBotUsernames } from "@backend/server/telegram/username";

/**
 * Is this Telegram bot username free? `GET /api/v1/bots/username-check?username=my_shop_bot&name=My Shop`
 * Returns the status plus suggestions when it is taken, invalid or unknown.
 */
export const GET = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`username-check:${ctx.userId}`, 20, 60_000);
  const q = new URL(req.url).searchParams;
  const username = (q.get("username") ?? "").trim().replace(/^@/, "").slice(0, 64);
  const name = (q.get("name") ?? "").trim().slice(0, 64);
  const problem = username ? botUsernameProblem(username) : "Enter a username.";
  const status = problem ? "invalid" : await checkBotUsername(username);
  const suggestions = status === "available" ? [] : await suggestBotUsernames(name || username, username);
  return ok({ username, status, problem, suggestions }, {}, 200, requestId);
});
