/** Plan catalog. Pure data, safe to import from both server and browser code. Amounts are in minor units (cents, paise). */
export type PlanId = "free" | "pro" | "business";
export type Cycle = "monthly" | "annual";
export type Currency = "USD" | "INR";
export interface PlanLimits {
  bots: number;
  /** Workflow and bot runs per calendar month. Infinity means unlimited. */
  executionsPerMonth: number;
  analyticsDays: number;
  members: number;
}
export interface PlanDef {
  id: PlanId;
  name: string;
  limits: PlanLimits;
  /** Monthly price in minor units. */
  monthly: Record<Currency, number>;
}
/** Annual billing is 12 months at a 20% discount. */
export const ANNUAL_DISCOUNT = 0.2;
export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", name: "Free", limits: { bots: 3, executionsPerMonth: 100, analyticsDays: 7, members: 1 }, monthly: { USD: 0, INR: 0 } },
  pro: { id: "pro", name: "Pro", limits: { bots: 20, executionsPerMonth: 5000, analyticsDays: 30, members: 5 }, monthly: { USD: 900, INR: 74900 } },
  business: { id: "business", name: "Business", limits: { bots: 100, executionsPerMonth: Infinity, analyticsDays: 365, members: Infinity }, monthly: { USD: 2900, INR: 239900 } },
};
export const PAID_PLANS: PlanId[] = ["pro", "business"];
export const isPlanId = (v: unknown): v is PlanId => v === "free" || v === "pro" || v === "business";
/** Price for one billing period, in minor units. Annual rounds to a whole currency unit. */
export function priceFor(plan: PlanId, cycle: Cycle, currency: Currency): number {
  const monthly = PLANS[plan].monthly[currency];
  if (cycle === "monthly") return monthly;
  return Math.round((monthly * 12 * (1 - ANNUAL_DISCOUNT)) / 100) * 100;
}
export function periodEnd(from: Date, cycle: Cycle): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + (cycle === "annual" ? 12 : 1));
  return d;
}
export const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
