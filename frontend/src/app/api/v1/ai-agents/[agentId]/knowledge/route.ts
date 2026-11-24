import { ok, readJson, route } from "@backend/lib/http/api";
import { knowledgeInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { addKnowledge, listKnowledge } from "@backend/server/services/ai-agents";

type Ctx = { params: Promise<{ agentId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await listKnowledge(ctx, uuid.parse((await params).agentId)), {}, 200, requestId);
});

export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = knowledgeInput.parse(await readJson(req, 64 * 1024));
  return ok(await addKnowledge(ctx, uuid.parse((await params).agentId), input), {}, 201, requestId);
});
