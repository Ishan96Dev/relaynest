import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { automationInput, deleteAutomation, getAutomation, saveAutomation } from "@backend/server/services/automations";
type P = { params: Promise<{ automationId: string }> };
export const GET = route<P>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await getAutomation(ctx, uuid.parse((await params).automationId)), {}, 200, requestId);
});
export const PUT = route<P>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await saveAutomation(ctx, uuid.parse((await params).automationId), automationInput.parse(await readJson(req, 512 * 1024))), {}, 200, requestId);
});
export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireAuth();
  await deleteAutomation(ctx, uuid.parse((await params).automationId));
  return new Response(null, { status: 204 });
});