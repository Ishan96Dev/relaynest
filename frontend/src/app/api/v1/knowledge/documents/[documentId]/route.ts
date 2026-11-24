import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { deleteDocument, previewDocument } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ documentId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await previewDocument(ctx, uuid.parse((await params).documentId)), {}, 200, requestId);
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  await deleteDocument(ctx, uuid.parse((await params).documentId));
  return ok({ deleted: true }, {}, 200, requestId);
});
