import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { unpublishAutomation } from "@backend/server/services/automations";
export const POST = route<{ params: Promise<{ automationId: string }> }>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await unpublishAutomation(ctx, uuid.parse((await params).automationId)), {}, 200, requestId);
});