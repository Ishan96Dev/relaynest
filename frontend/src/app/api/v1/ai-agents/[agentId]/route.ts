import { ok, readJson, route } from "@backend/lib/http/api";
import { updateAiAgentInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deleteAiAgent, getAiAgent, listKnowledge, updateAiAgent } from "@backend/server/services/ai-agents";

type Ctx = { params: Promise<{ agentId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  const id = uuid.parse((await params).agentId);
  const [agent, knowledge] = await Promise.all([getAiAgent(ctx, id), listKnowledge(ctx, id)]);
  return ok({ ...agent, knowledge }, {}, 200, requestId);
});

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = updateAiAgentInput.parse(await readJson(req));
  return ok(await updateAiAgent(ctx, uuid.parse((await params).agentId), input), {}, 200, requestId);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const ctx = await requireAuth();
  await deleteAiAgent(ctx, uuid.parse((await params).agentId));
  return new Response(null, { status: 204 });
});
