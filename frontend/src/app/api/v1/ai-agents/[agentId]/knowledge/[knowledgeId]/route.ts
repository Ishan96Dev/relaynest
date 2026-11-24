import { route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deleteKnowledge } from "@backend/server/services/ai-agents";

type Ctx = { params: Promise<{ agentId: string; knowledgeId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const ctx = await requireAuth();
  const p = await params;
  await deleteKnowledge(ctx, uuid.parse(p.agentId), uuid.parse(p.knowledgeId));
  return new Response(null, { status: 204 });
});
