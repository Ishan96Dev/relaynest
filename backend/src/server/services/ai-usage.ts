import "server-only";
import { requireAuth, type AuthContext } from "@backend/server/auth/context";
import { getEntitlements } from "@backend/server/billing/entitlements";
export interface AiUsageData {
  days: number;
  maxDays: number;
  totals: { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number };
  byProvider: { source: "nvidia" | "vercel"; requests: number; tokens: number; costUsd: number }[];
  byModel: { slug: string; source: "nvidia" | "vercel"; requests: number; tokens: number; costUsd: number }[];
  byOrigin: { origin: string; requests: number; tokens: number }[];
  daily: { day: string; tokens: number; costUsd: number }[];
  /** Vercel AI Gateway account balance. Only present for platform admins, because it describes the shared provider account. */
  gateway: { balance: number; totalUsed: number } | null;
}
interface Row { source: string; model_slug: string; origin: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number | string; created_at: string }
const isPlatformAdmin = (email?: string) =>
  Boolean(email && (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase()));
/** Account-level balance and lifetime spend from Vercel's GET /v1/credits. NVIDIA Build has no equivalent endpoint. */
async function gatewayCredits(): Promise<AiUsageData["gateway"]> {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { balance?: string; total_used?: string };
    return { balance: Number(j.balance ?? 0), totalUsed: Number(j.total_used ?? 0) };
  } catch {
    return null;
  }
}
export async function getAiUsage(ctx?: AuthContext, requestedDays = 7): Promise<AiUsageData> {
  const c = ctx ?? (await requireAuth());
  const { plan } = await getEntitlements(c.workspaceId);
  const maxDays = Math.min(30, plan.limits.analyticsDays);
  const days = Math.max(1, Math.min(requestedDays, maxDays));
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [{ data }, gateway] = await Promise.all([
    c.supabase.from("ai_usage_events").select("source, model_slug, origin, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at")
      .eq("workspace_id", c.workspaceId).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(10000),
    isPlatformAdmin(c.email) ? gatewayCredits() : Promise.resolve(null),
  ]);
  const rows = (data ?? []) as Row[];
  const totals = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
  const providers = new Map<string, { source: "nvidia" | "vercel"; requests: number; tokens: number; costUsd: number }>();
  const models = new Map<string, { slug: string; source: "nvidia" | "vercel"; requests: number; tokens: number; costUsd: number }>();
  const origins = new Map<string, { origin: string; requests: number; tokens: number }>();
  const daily = new Map<string, { day: string; tokens: number; costUsd: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    daily.set(d, { day: d, tokens: 0, costUsd: 0 });
  }
  for (const r of rows) {
    const cost = Number(r.cost_usd) || 0;
    const source = r.source as "nvidia" | "vercel";
    totals.requests++; totals.promptTokens += r.prompt_tokens; totals.completionTokens += r.completion_tokens; totals.totalTokens += r.total_tokens; totals.costUsd += cost;
    const p = providers.get(source) ?? { source, requests: 0, tokens: 0, costUsd: 0 };
    p.requests++; p.tokens += r.total_tokens; p.costUsd += cost; providers.set(source, p);
    const m = models.get(r.model_slug) ?? { slug: r.model_slug, source, requests: 0, tokens: 0, costUsd: 0 };
    m.requests++; m.tokens += r.total_tokens; m.costUsd += cost; models.set(r.model_slug, m);
    const o = origins.get(r.origin) ?? { origin: r.origin, requests: 0, tokens: 0 };
    o.requests++; o.tokens += r.total_tokens; origins.set(r.origin, o);
    const day = daily.get(r.created_at.slice(0, 10));
    if (day) { day.tokens += r.total_tokens; day.costUsd += cost; }
  }
  return {
    days, maxDays, totals, gateway,
    byProvider: [...providers.values()].sort((a, b) => b.tokens - a.tokens),
    byModel: [...models.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10),
    byOrigin: [...origins.values()].sort((a, b) => b.tokens - a.tokens),
    daily: [...daily.values()],
  };
}
