import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { cancelSubscription } from "@backend/server/billing/service";
const body = z.object({ atCycleEnd: z.boolean().default(true) });
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const { atCycleEnd } = body.parse(await readJson(req));
  return ok(await cancelSubscription(ctx, atCycleEnd), {}, 200, requestId);
});
