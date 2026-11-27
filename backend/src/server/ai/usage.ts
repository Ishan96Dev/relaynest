import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { nvidiaPricing } from "@backend/lib/env/integrations";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { logEvent } from "@backend/server/logger";
export type UsageOrigin = "playground" | "agent" | "knowledge" | "api";
export interface UsageScope {
  workspaceId: string;
  userId?: string;
  origin: UsageOrigin;
  botId?: string;
  executionId?: string;
}
/**
 * Who a model call is billed to. Set once at the entry point (Playground request, Telegram update, document indexing);
 * every provider call inside it is then metered without threading the workspace through each function.
 * Needs the Node `async_hooks` module, which Cloudflare Workers provides with the nodejs_compat flag.
 */
const store = new AsyncLocalStorage<UsageScope>();
export const withUsageScope = <T>(scope: UsageScope, fn: () => Promise<T>): Promise<T> => store.run(scope, fn);
export type UsageKind = "chat" | "embedding" | "image" | "decision" | "vision";
export interface UsageRecord {
  slug: string;
  source: "nvidia" | "vercel";
  apiModelId: string;
  kind: UsageKind;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cost reported by the provider, when it reports one. */
  reportedCostUsd?: number;
  latencyMs: number;
  requestId?: string;
}
interface GatewayPricing { prompt: number; completion: number }
let gatewayPrices: { at: number; map: Map<string, GatewayPricing> } | null = null;
/** Vercel AI Gateway publishes per-token USD prices on its public model list (no key needed). Cached for an hour. */
async function gatewayPrice(modelId: string): Promise<GatewayPricing | null> {
  try {
    if (!gatewayPrices || Date.now() - gatewayPrices.at > 3_600_000) {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/models", { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as { data?: { id: string; pricing?: { input?: string; output?: string; prompt?: string; completion?: string } }[] };
      const map = new Map<string, GatewayPricing>();
      for (const m of json.data ?? []) {
        const p = m.pricing;
        const prompt = Number(p?.prompt ?? p?.input);
        const completion = Number(p?.completion ?? p?.output);
        if (Number.isFinite(prompt) && Number.isFinite(completion)) map.set(m.id, { prompt, completion });
      }
      gatewayPrices = { at: Date.now(), map };
    }
    return gatewayPrices.map.get(modelId) ?? null;
  } catch {
    return null;
  }
}
async function costOf(r: UsageRecord): Promise<number> {
  if (typeof r.reportedCostUsd === "number") return r.reportedCostUsd;
  if (r.source === "nvidia") {
    const p = nvidiaPricing();
    return (r.promptTokens * p.inputPerMTok + r.completionTokens * p.outputPerMTok) / 1_000_000;
  }
  const price = await gatewayPrice(r.apiModelId);
  return price ? r.promptTokens * price.prompt + r.completionTokens * price.completion : 0;
}
/** Stores one metered call. Never throws: losing a usage row must not fail the user's request. */
export async function recordUsage(r: UsageRecord): Promise<void> {
  const scope = store.getStore();
  if (!scope) return;
  try {
    await createAdminClient().from("ai_usage_events").insert({
      workspace_id: scope.workspaceId,
      user_id: scope.userId ?? null,
      bot_id: scope.botId ?? null,
      execution_id: scope.executionId ?? null,
      source: r.source,
      model_slug: r.slug,
      api_model_id: r.apiModelId,
      kind: r.kind,
      origin: scope.origin,
      prompt_tokens: r.promptTokens,
      completion_tokens: r.completionTokens,
      total_tokens: r.totalTokens,
      cost_usd: Number((await costOf(r)).toFixed(8)),
      latency_ms: r.latencyMs,
      provider_request_id: r.requestId ?? null,
    });
    logEvent("llm", "info", `${r.source} ${r.slug} (${scope.origin}) · ${r.totalTokens} tok · ${r.latencyMs} ms`);
  } catch {
    logEvent("llm", "error", `Could not record usage for ${r.slug}`);
  }
}
