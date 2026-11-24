import { ok, readJson, route } from "@backend/lib/http/api";
import { createAiAgentInput } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { createAiAgent, listAiAgents } from "@backend/server/services/ai-agents";

export const GET = route(async (_req, _ctx, requestId) => {
  const ctx = await requireAuth();
  return ok(await listAiAgents(ctx), {}, 200, requestId);
});

export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const input = createAiAgentInput.parse(await readJson(req));
  return ok(await createAiAgent(ctx, input), {}, 201, requestId);
});
