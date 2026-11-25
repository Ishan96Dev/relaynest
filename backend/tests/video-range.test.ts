import { describe, it } from "node:test";
import { expect } from "./expect";
import { parseByteRange, serveAssetWithRange, sliceByteStream } from "../../cloudflare/range";

function makeChunkedStream(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const next = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
      offset += next.byteLength;
      controller.enqueue(next);
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

describe("parseByteRange", () => {
  it("parses explicit, open-ended, suffix, and clamped byte ranges", () => {
    expect(parseByteRange("bytes=0-1", 1000)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=200-5000", 1000)).toEqual({ start: 200, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("flags unsatisfiable and malformed ranges cleanly", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=500-400", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("items=0-10", 1000)).toBe(null);
    expect(parseByteRange(null, 1000)).toBe(null);
  });
});

describe("sliceByteStream & serveAssetWithRange", () => {
  const payload = Uint8Array.from({ length: 256 }, (_, i) => i);

  it("slices streams accurately across arbitrary chunk boundaries", async () => {
    const sliced = sliceByteStream(makeChunkedStream(payload, 17), 40, 125);
    const out = await readAll(sliced);
    expect(Array.from(out)).toEqual(Array.from(payload.subarray(40, 126)));
  });

  it("converts a 200 static asset response into 206 Partial Content for Range requests", async () => {
    const fakeAssets = {
      async fetch() {
        return new Response(makeChunkedStream(payload, 19), {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": String(payload.byteLength),
            etag: '"vid-v1"',
          },
        });
      },
    };

    const req = new Request("https://relaynest.example/video/relaynest-product-demo.mp4", {
      headers: { Range: "bytes=32-95" },
    });
    const res = await serveAssetWithRange(req, fakeAssets);
    expect(res.status).toBe(206);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-range")).toBe("bytes 32-95/256");
    expect(res.headers.get("content-length")).toBe("64");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(payload.subarray(32, 96)));
  });

  it("returns 416 Range Not Satisfiable for out-of-bounds seeks", async () => {
    const fakeAssets = {
      async fetch() {
        return new Response(makeChunkedStream(payload, 64), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(payload.byteLength) },
        });
      },
    };

    const req = new Request("https://relaynest.example/video/relaynest-product-demo.mp4", {
      headers: { Range: "bytes=500-600" },
    });
    const res = await serveAssetWithRange(req, fakeAssets);
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */256");
  });

  it("preserves Accept-Ranges on plain 200 and HEAD requests and passes through native 206", async () => {
    const fakeAssets = {
      async fetch(input: RequestInfo | URL) {
        const r = input instanceof Request ? input : new Request(input);
        if (r.headers.get("range") === "bytes=0-1") {
          return new Response(payload.subarray(0, 2), {
            status: 206,
            headers: { "content-range": "bytes 0-1/256", "content-length": "2", "content-type": "video/mp4" },
          });
        }
        return new Response(payload, {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(payload.byteLength) },
        });
      },
    };

    const res200 = await serveAssetWithRange(
      new Request("https://relaynest.example/video/relaynest-product-demo.mp4"),
      fakeAssets,
    );
    expect(res200.status).toBe(200);
    expect(res200.headers.get("accept-ranges")).toBe("bytes");

    const resHead = await serveAssetWithRange(
      new Request("https://relaynest.example/video/relaynest-product-demo.mp4", { method: "HEAD" }),
      fakeAssets,
    );
    expect(resHead.status).toBe(200);
    expect(resHead.headers.get("accept-ranges")).toBe("bytes");
    expect((await resHead.arrayBuffer()).byteLength).toBe(0);

    const res206 = await serveAssetWithRange(
      new Request("https://relaynest.example/video/relaynest-product-demo.mp4", { headers: { Range: "bytes=0-1" } }),
      fakeAssets,
    );
    expect(res206.status).toBe(206);
    expect(res206.headers.get("accept-ranges")).toBe("bytes");
    expect(Array.from(new Uint8Array(await res206.arrayBuffer()))).toEqual([0, 1]);
  });
});
