import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { runInput, runModel, runModelStream } from "@backend/server/services/ai-run";

export const maxDuration = 120;

/** Runs a catalog model for the Playground (supports SSE streaming for chat, plus embeddings, image generation and decisions). */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const input = runInput.parse(await readJson(req, 2 * 1024 * 1024));
  const wantsStream = input.kind === "chat" && (input.stream || (req.headers.get("accept") ?? "").includes("text/event-stream"));
  if (wantsStream) {
    const body = await runModelStream(ctx, input, req.signal);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        "x-request-id": requestId,
      },
    });
  }
  return ok(await runModel(ctx, input), {}, 200, requestId);
});
