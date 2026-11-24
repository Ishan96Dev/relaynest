import { ok, readJson, route } from "@backend/lib/http/api";
import { requireAuth } from "@backend/server/auth/context";
import { runInput, runModel } from "@backend/server/services/ai-run";

export const maxDuration = 120;

/** Runs a catalog model for the Playground (chat, embeddings, image generation or a yes/no decision). */
export const POST = route(async (req, _ctx, requestId) => {
  const ctx = await requireAuth();
  const input = runInput.parse(await readJson(req, 256 * 1024));
  return ok(await runModel(ctx, input), {}, 200, requestId);
});
