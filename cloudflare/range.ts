export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses a single RFC 9110 `Range: bytes=...` header value against a known entity size.
 * Returns `"unsatisfiable"` when the header is syntactically a byte range that cannot be
 * satisfied for `totalSize`, or `null` when no usable byte range is present.
 */
export function parseByteRange(
  rangeHeader: string | null,
  totalSize: number,
): ByteRange | "unsatisfiable" | null {
  if (!rangeHeader || !Number.isFinite(totalSize) || totalSize <= 0) return null;
  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bytes=")) return null;

  // Handle the first requested range (browsers always send a single range for media seeking).
  const firstSpec = trimmed.slice(6).split(",")[0]?.trim();
  if (!firstSpec) return null;

  const dashIdx = firstSpec.indexOf("-");
  if (dashIdx === -1) return null;

  const startStr = firstSpec.slice(0, dashIdx).trim();
  const endStr = firstSpec.slice(dashIdx + 1).trim();

  if (startStr === "" && endStr === "") return null;

  if (startStr === "") {
    // Suffix byte range: `bytes=-500` -> last 500 bytes
    if (!/^\d+$/.test(endStr)) return null;
    const suffixLen = Number(endStr);
    if (!Number.isSafeInteger(suffixLen) || suffixLen <= 0) return "unsatisfiable";
    const start = Math.max(0, totalSize - suffixLen);
    return { start, end: totalSize - 1 };
  }

  if (!/^\d+$/.test(startStr)) return null;
  const start = Number(startStr);
  if (!Number.isSafeInteger(start) || start >= totalSize) return "unsatisfiable";

  if (endStr === "") {
    return { start, end: totalSize - 1 };
  }

  if (!/^\d+$/.test(endStr)) return null;
  const parsedEnd = Number(endStr);
  if (!Number.isSafeInteger(parsedEnd) || parsedEnd < start) return "unsatisfiable";

  return { start, end: Math.min(parsedEnd, totalSize - 1) };
}

/**
 * Slices a `ReadableStream<Uint8Array>` to emit only bytes in `[start, end]` (inclusive),
 * discarding leading bytes in constant memory and cancelling the upstream reader as soon
 * as `end` is reached.
 */
export function sliceByteStream(
  source: ReadableStream<Uint8Array>,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let position = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (!value || value.byteLength === 0) continue;

        const chunkStart = position;
        const chunkEnd = position + value.byteLength - 1;
        position += value.byteLength;

        if (chunkEnd < start) {
          continue;
        }

        const sliceStart = Math.max(0, start - chunkStart);
        const sliceEnd = Math.min(value.byteLength, end - chunkStart + 1);
        const piece =
          sliceStart === 0 && sliceEnd === value.byteLength
            ? value
            : value.subarray(sliceStart, sliceEnd);

        controller.enqueue(piece);

        if (chunkEnd >= end) {
          await reader.cancel().catch(() => {});
          controller.close();
          return;
        }
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason).catch(() => {});
    },
  });
}

function buildBaseMediaHeaders(source: Headers, pathname: string): Headers {
  const headers = new Headers();
  const passthrough = [
    "content-type",
    "etag",
    "last-modified",
    "cache-control",
    "x-content-type-options",
  ];
  for (const key of passthrough) {
    const val = source.get(key);
    if (val) headers.set(key, val);
  }
  if (!headers.has("content-type")) {
    if (pathname.endsWith(".mp4")) headers.set("content-type", "video/mp4");
    else if (pathname.endsWith(".vtt")) headers.set("content-type", "text/vtt; charset=utf-8");
    else if (pathname.endsWith(".srt")) headers.set("content-type", "text/plain; charset=utf-8");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=3600");
  }
  headers.set("accept-ranges", "bytes");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export interface AssetsFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Serves static video assets from Cloudflare Workers `ASSETS` with full RFC 9110
 * HTTP `Range` (`206 Partial Content`) support so browser timeline scrubbing and
 * chapter seeking work reliably across Chrome, Safari, Firefox, and Edge.
 */
export async function serveAssetWithRange(
  request: Request,
  assets: AssetsFetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const rangeHeader = request.headers.get("range");
  const isHead = request.method === "HEAD";

  // Forward the request to Cloudflare's ASSETS binding. If Cloudflare honors Range natively,
  // pass the 206 through cleanly with Accept-Ranges preserved.
  const assetRes = await assets.fetch(request);

  if (assetRes.status === 206) {
    const headers = new Headers(assetRes.headers);
    headers.set("accept-ranges", "bytes");
    return new Response(isHead ? null : assetRes.body, {
      status: 206,
      headers,
    });
  }

  if (!assetRes.ok) {
    return assetRes;
  }

  const baseHeaders = buildBaseMediaHeaders(assetRes.headers, url.pathname);
  const contentLengthHeader = assetRes.headers.get("content-length");
  const knownSize =
    contentLengthHeader && /^\d+$/.test(contentLengthHeader) ? Number(contentLengthHeader) : null;

  if (!rangeHeader) {
    if (knownSize !== null) {
      baseHeaders.set("content-length", String(knownSize));
    }
    return new Response(isHead ? null : assetRes.body, {
      status: 200,
      headers: baseHeaders,
    });
  }

  // Range requested, but upstream static asset returned 200 OK -> slice into 206 Partial Content.
  if (knownSize !== null && assetRes.body) {
    const parsed = parseByteRange(rangeHeader, knownSize);
    if (parsed === "unsatisfiable") {
      await assetRes.body.cancel().catch(() => {});
      baseHeaders.set("content-range", `bytes */${knownSize}`);
      baseHeaders.set("content-length", "0");
      return new Response(null, { status: 416, headers: baseHeaders });
    }
    if (parsed) {
      const length = parsed.end - parsed.start + 1;
      baseHeaders.set("content-range", `bytes ${parsed.start}-${parsed.end}/${knownSize}`);
      baseHeaders.set("content-length", String(length));
      const body = isHead ? null : sliceByteStream(assetRes.body, parsed.start, parsed.end);
      if (isHead) {
        await assetRes.body.cancel().catch(() => {});
      }
      return new Response(body, { status: 206, headers: baseHeaders });
    }
    baseHeaders.set("content-length", String(knownSize));
    return new Response(isHead ? null : assetRes.body, { status: 200, headers: baseHeaders });
  }

  // Fallback when Content-Length was omitted on the upstream 200 response.
  const full = new Uint8Array(await assetRes.arrayBuffer());
  const totalSize = full.byteLength;
  const parsed = parseByteRange(rangeHeader, totalSize);
  if (parsed === "unsatisfiable") {
    baseHeaders.set("content-range", `bytes */${totalSize}`);
    baseHeaders.set("content-length", "0");
    return new Response(null, { status: 416, headers: baseHeaders });
  }
  if (parsed) {
    const chunk = full.subarray(parsed.start, parsed.end + 1);
    baseHeaders.set("content-range", `bytes ${parsed.start}-${parsed.end}/${totalSize}`);
    baseHeaders.set("content-length", String(chunk.byteLength));
    return new Response(isHead ? null : chunk, { status: 206, headers: baseHeaders });
  }
  baseHeaders.set("content-length", String(totalSize));
  return new Response(isHead ? null : full, { status: 200, headers: baseHeaders });
}
