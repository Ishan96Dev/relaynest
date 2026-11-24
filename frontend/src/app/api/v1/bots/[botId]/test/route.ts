import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { testBot } from "@backend/server/services/bots";

const bodySchema = z.object({
  chatId: z.string().trim().max(64).optional(),
  message: z.string().trim().min(1).max(2000),
});

export const POST = route<{ params: Promise<{ botId: string }> }>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  rateLimit(`bot-test:${ctx.userId}`, 20, 60_000);
  const input = bodySchema.parse(await readJson(req));
  return ok(await testBot(ctx, uuid.parse((await params).botId), input), {}, 200, requestId);
});
