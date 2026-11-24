import { ok, readJson, route } from "@backend/lib/http/api";
import { collectionBotsInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { setCollectionBots } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ collectionId: string }> };

/** Replaces the bots that can use this collection. */
export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = collectionBotsInput.parse(await readJson(req));
  return ok({ botIds: await setCollectionBots(ctx, uuid.parse((await params).collectionId), input.botIds) }, {}, 200, requestId);
});
