import { after } from "next/server";
import { ApiError, Errors, ok, readJson, route } from "@backend/lib/http/api";
import { urlDocumentInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { createFileDocument, createUrlDocument, listDocuments, processDocument } from "@backend/server/services/knowledge";

export const maxDuration = 300;

export const GET = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const collection = new URL(req.url).searchParams.get("collectionId");
  return ok(await listDocuments(ctx, collection ? uuid.parse(collection) : undefined), {}, 200, requestId);
});

/**
 * multipart/form-data with `file` and `collectionId` uploads a file (PDF, Word, Excel, CSV, PPTX, TXT, MD, JSON, HTML);
 * JSON `{ collectionId, url, mode?, maxPages?, maxDepth?, samePathPrefix?, pathPrefix?, excludePatterns? }` scrapes a page, sitemap, or subpages.
 */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 11 * 1024 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Files can be up to 10 MB.");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw Errors.invalid("Choose a file to upload.");
    const doc = await createFileDocument(ctx, uuid.parse(form.get("collectionId")), file);
    after(() => processDocument(ctx.workspaceId, doc.id));
    return ok(doc, {}, 201, requestId);
  }
  const input = urlDocumentInput.parse(await readJson(req));
  const doc = await createUrlDocument(ctx, input.collectionId, input.url, {
    mode: input.mode,
    config: {
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      samePathPrefix: input.samePathPrefix,
      pathPrefix: input.pathPrefix,
      excludePatterns: input.excludePatterns,
    },
  });
  after(() => processDocument(ctx.workspaceId, doc.id));
  return ok(doc, {}, 201, requestId);
});
