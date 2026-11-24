import { ok, readJson, route } from "@backend/lib/http/api";
import { validateTokenInput } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getMe } from "@backend/server/telegram/client";

/** Checks a token with Telegram. Returns only safe bot identity; the token is never stored or echoed. */
export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth();
  const { token } = validateTokenInput.parse(await readJson(req));
  const me = await getMe(token);
  return ok({ botId: me.id, username: me.username, displayName: me.firstName, valid: true }, {}, 200, requestId);
});
