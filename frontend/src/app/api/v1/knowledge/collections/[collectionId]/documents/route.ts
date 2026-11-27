import { ok, readJson, route } from "@backend/lib/http/api";
import { collectionDocumentsInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { setCollectionDocuments } from "@backend/server/services/knowledge";

type Ctx = { params: Promise<{ collectionId: string }> };

/** Replaces the set of knowledge documents assigned to a collection (syncs Supabase & Milvus). */
export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const input = collectionDocumentsInput.parse(await readJson(req));
  return ok(await setCollectionDocuments(ctx, uuid.parse((await params).collectionId), input.documentIds), {}, 200, requestId);
});
