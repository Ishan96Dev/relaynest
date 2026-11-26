import "server-only";
import { PLANS, type PlanDef, type PlanId } from "@backend/lib/billing/plans";
import { ApiError } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { redisDel, redisGet, redisSet } from "@backend/server/cache/redis";
import { notifyOwners } from "@backend/server/notifications";
export interface SubscriptionRow {
  plan: PlanId;
  status: string;
  mode: "recurring" | "one_time";
  billing_cycle: "monthly" | "annual";
  currency: "USD" | "INR";
  razorpay_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}
export const SUBSCRIPTION_COLUMNS = "plan, status, mode, billing_cycle, currency, razorpay_subscription_id, current_period_start, current_period_end, cancel_at_period_end";
const GRACE_MS = 3 * 86_400_000;
/**
 * The plan a workspace is allowed to use right now.
 * One-time purchases last exactly one period. A recurring subscription keeps its plan while it is active
 * (with a short grace for late webhooks), and until the paid-through date once cancelled or halted for failed payments.
 */
export function effectivePlan(sub: Pick<SubscriptionRow, "plan" | "status" | "mode" | "current_period_end"> | null | undefined, now = Date.now()): PlanId {
  if (!sub || sub.plan === "free") return "free";
  const end = sub.current_period_end ? Date.parse(sub.current_period_end) : null;
  if (sub.mode === "one_time") return sub.status === "active" && end !== null && end > now ? sub.plan : "free";
  if (sub.status === "active") return end === null || end + GRACE_MS > now ? sub.plan : "free";
  if (["cancelled", "pending", "halted"].includes(sub.status)) return end !== null && end > now ? sub.plan : "free";
  return "free";
}
export interface Entitlements { planId: PlanId; plan: PlanDef }
const cache = new Map<string, { at: number; value: Entitlements }>();
const TTL_MS = 30_000;
export function clearEntitlementCache(workspaceId: string) { cache.delete(workspaceId); execCache.delete(workspaceId); void redisDel(`ent:${workspaceId}`); }
/** Plan and limits of a workspace. Cached in memory + Redis for 30 s; billing changes clear both. */
export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const rHit = await redisGet(`ent:${workspaceId}`);
  if (rHit && rHit in PLANS) {
    const value = { planId: rHit as PlanId, plan: PLANS[rHit as PlanId] };
    cache.set(workspaceId, { at: Date.now(), value });
    return value;
  }
  const { data } = await createAdminClient().from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("workspace_id", workspaceId).maybeSingle();
  const planId = effectivePlan(data as SubscriptionRow | null);
  const value = { planId, plan: PLANS[planId] };
  cache.set(workspaceId, { at: Date.now(), value });
  void redisSet(`ent:${workspaceId}`, planId, 30);
  return value;
}
const monthStart = () => { const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };
export async function executionsThisMonth(workspaceId: string): Promise<number> {
  const { count } = await createAdminClient().from("executions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("started_at", monthStart());
  return count ?? 0;
}
/** Throws when the workspace has reached its bot limit (including unlinked draft AI agents). */
export async function assertBotLimit(workspaceId: string) {
  const { plan } = await getEntitlements(workspaceId);
  const admin = createAdminClient();
  const [{ count: botCount }, { count: draftAgentCount }] = await Promise.all([
    admin.from("bots").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    admin.from("ai_agents").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("bot_id", null),
  ]);
  if ((botCount ?? 0) + (draftAgentCount ?? 0) >= plan.limits.bots) {
    await notifyOwners(workspaceId, { kind: "plan_limit", title: "Bot limit reached", body: `The ${plan.name} plan allows up to ${plan.limits.bots} bots. Upgrade to add more.`, emailKey: "billing", dedupeHours: 24 });
    throw new ApiError(402, "PLAN_LIMIT", `The ${plan.name} plan allows up to ${plan.limits.bots} bots. Upgrade your plan to add more.`);
  }
}

/** Throws when the workspace has reached its monthly execution limit. Uses the 60s soft cache to avoid a count query per request. */
export async function assertExecutionLimit(workspaceId: string) {
  const hit = execCache.get(workspaceId);
  if (hit && Date.now() - hit.at < 60_000 && hit.allowed) return;
  const { plan } = await getEntitlements(workspaceId);
  if (plan.limits.executionsPerMonth === Infinity) {
    execCache.set(workspaceId, { at: Date.now(), allowed: true });
    return;
  }
  const used = await executionsThisMonth(workspaceId);
  const allowed = used < plan.limits.executionsPerMonth;
  execCache.set(workspaceId, { at: Date.now(), allowed });
  if (!allowed) {
    throw new ApiError(
      402,
      "PLAN_LIMIT",
      `The ${plan.name} plan allows up to ${plan.limits.executionsPerMonth.toLocaleString()} executions/month. Upgrade your plan to continue.`,
    );
  }
}
const execCache = new Map<string, { at: number; allowed: boolean }>();
/**
 * True while the workspace is under its monthly execution limit. The result is cached for a minute, so a burst can
 * overshoot the limit slightly; that is acceptable for a soft quota and avoids a count query per message.
 */
export async function executionAllowed(workspaceId: string): Promise<boolean> {
  const hit = execCache.get(workspaceId);
  if (hit && Date.now() - hit.at < 60_000) return hit.allowed;
  const { plan } = await getEntitlements(workspaceId);
  const allowed = plan.limits.executionsPerMonth === Infinity || (await executionsThisMonth(workspaceId)) < plan.limits.executionsPerMonth;
  execCache.set(workspaceId, { at: Date.now(), allowed });
  if (!allowed) await notifyOwners(workspaceId, { kind: "plan_limit", title: "Monthly execution limit reached", body: `Your ${plan.name} plan allows ${plan.limits.executionsPerMonth.toLocaleString()} executions per month. Bots stop replying until you upgrade or the month resets.`, emailKey: "billing", dedupeHours: 24 });
  return allowed;
}
