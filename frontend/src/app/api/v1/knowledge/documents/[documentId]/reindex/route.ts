import { after } from "next/server";
import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { prepareReindex, processDocument } from "@backend/server/services/knowledge";

export const maxDuration = 300;

type Ctx = { params: Promise<{ documentId: string }> };

/** Re-reads the document and rebuilds its chunks and vectors. Also the way to retry a failed document. */
export const POST = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  const doc = await prepareReindex(ctx, uuid.parse((await params).documentId));
  after(() => processDocument(ctx.workspaceId, doc.id));
  return ok(doc, {}, 202, requestId);
});
