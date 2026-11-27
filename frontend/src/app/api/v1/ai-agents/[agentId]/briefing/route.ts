import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import {
  agentBriefingInput,
  getAgentBriefing,
  sendAgentBriefingNow,
  sendBriefingNowInput,
  upsertAgentBriefing,
} from "@backend/server/services/agent-briefings";

type Ctx = { params: Promise<{ agentId: string }> };

export const maxDuration = 60;

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await getAgentBriefing(ctx, uuid.parse((await params).agentId)), {}, 200, requestId);
});

export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = agentBriefingInput.parse(await readJson(req));
  return ok(await upsertAgentBriefing(ctx, uuid.parse((await params).agentId), input), {}, 200, requestId);
});

export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = sendBriefingNowInput.parse(await readJson(req));
  return ok(await sendAgentBriefingNow(ctx, uuid.parse((await params).agentId), input), {}, 200, requestId);
});
