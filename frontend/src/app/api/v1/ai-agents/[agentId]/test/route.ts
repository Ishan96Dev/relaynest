import { ok, readJson, route } from "@backend/lib/http/api";
import { testInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { testAiAgent } from "@backend/server/services/ai-agents";

export const maxDuration = 120;

type Ctx = { params: Promise<{ agentId: string }> };

/** One reply from the agent, used by the live chat preview in the wizard. */
export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = testInput.parse(await readJson(req, 128 * 1024));
  return ok(await testAiAgent(ctx, uuid.parse((await params).agentId), input), {}, 200, requestId);
});
