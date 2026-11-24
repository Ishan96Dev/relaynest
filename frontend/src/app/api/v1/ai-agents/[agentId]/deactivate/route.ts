import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deactivateAiAgent } from "@backend/server/services/ai-agents";

type Ctx = { params: Promise<{ agentId: string }> };

export const POST = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await deactivateAiAgent(ctx, uuid.parse((await params).agentId)), {}, 200, requestId);
});
