import { ok, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { listWorkspaceKnowledgeLogs } from "@backend/server/services/knowledge";

/** Returns workspace-wide or per-document knowledge ingestion & scraping logs. */
export const GET = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const sp = new URL(req.url).searchParams;
  const docParam = sp.get("documentId");
  const limitParam = sp.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  return ok(
    await listWorkspaceKnowledgeLogs(ctx, {
      documentId: docParam ? uuid.parse(docParam) : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
    {},
    200,
    requestId,
  );
});
