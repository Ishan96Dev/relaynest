import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { listDocumentLogs } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ documentId: string }> };

/** Returns live/persisted ingestion & scraping logs for a single knowledge document. */
export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await listDocumentLogs(ctx, uuid.parse((await params).documentId)), {}, 200, requestId);
});
