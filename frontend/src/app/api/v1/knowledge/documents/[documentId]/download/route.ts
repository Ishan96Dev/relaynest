import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { documentDownloadUrl } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ documentId: string }> };

/** Returns a 60-second signed link to the original file (or the page address for a URL source). */
export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await documentDownloadUrl(ctx, uuid.parse((await params).documentId)), {}, 200, requestId);
});
