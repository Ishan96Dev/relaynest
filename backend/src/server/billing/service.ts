import "server-only";
import { z } from "zod";
import { periodEnd, PLANS, priceFor, type Currency, type Cycle, type PlanId } from "@backend/lib/billing/plans";
import { publicEnv } from "@backend/lib/env/public";
import { ApiError, Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { sendEmail } from "@backend/server/email/mailer";
import { notifyOwners } from "@backend/server/notifications";
import { money, paymentFailedEmail, paymentReceiptEmail, subscriptionEndedEmail } from "@backend/server/email/templates";
import {
  cancelSubscription as rzpCancel, createOrder, createPlan, createSubscription, createUpiQr, fetchOrder, fetchPayment, fetchQr, fetchQrPayments, fetchSubscription, publicKeyId,
  razorpayConfigured, verifyCheckoutSignature, verifyWebhookSignature, type RzpPayment, type RzpSubscription,
} from "./razorpay";
import { clearEntitlementCache, effectivePlan, executionsThisMonth, SUBSCRIPTION_COLUMNS, type SubscriptionRow } from "./entitlements";
export const checkoutInput = z.object({
  plan: z.enum(["pro", "business"]),
  cycle: z.enum(["monthly", "annual"]),
  currency: z.literal("INR").default("INR"),
  /** "subscription" renews automatically; "one_time" is a prepaid single period. */
  mode: z.enum(["subscription", "one_time"]),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;
export const verifyInput = z.object({
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_order_id: z.string().min(1).max(64).optional(),
  razorpay_subscription_id: z.string().min(1).max(64).optional(),
  razorpay_signature: z.string().min(1).max(200),
}).refine((v) => Boolean(v.razorpay_order_id) !== Boolean(v.razorpay_subscription_id), "Send either an order id or a subscription id.");
const admin = () => createAdminClient();
const appUrl = () => publicEnv().NEXT_PUBLIC_APP_URL;
const notesOf = (n: unknown): Record<string, string> => (n && typeof n === "object" && !Array.isArray(n) ? (n as Record<string, string>) : {});
const fromUnix = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);
// ---------------------------------------------------------------- overview
export async function getBillingOverview(ctx: AuthContext) {
  const [subRes, payRes, invRes, bots, executions, tokens] = await Promise.all([
    ctx.supabase.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("workspace_id", ctx.workspaceId).maybeSingle(),
    ctx.supabase.from("payments").select("id, razorpay_payment_id, plan, amount, currency, status, method, card_network, card_last4, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("invoices").select("id, number, plan, description, amount, currency, status, issued_at, payment_id").eq("workspace_id", ctx.workspaceId).order("issued_at", { ascending: false }).limit(20),
    ctx.supabase.from("bots").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId),
    executionsThisMonth(ctx.workspaceId).catch(() => 0),
    aiTokensThisMonth(ctx),
  ]);
  const subscription = (subRes.data as SubscriptionRow | null) ?? null;
  const planId = effectivePlan(subscription);
  const limits = PLANS[planId].limits;
  return {
    configured: razorpayConfigured(),
    keyId: razorpayConfigured() ? publicKeyId() : null,
    canManage: ctx.role === "owner" || ctx.role === "admin",
    planId,
    planName: PLANS[planId].name,
    subscription,
    usage: {
      bots: { used: bots.count ?? 0, limit: limits.bots },
      executions: { used: executions, limit: Number.isFinite(limits.executionsPerMonth) ? limits.executionsPerMonth : null },
      aiTokens: { used: tokens },
    },
    payments: payRes.data ?? [],
    invoices: invRes.data ?? [],
  };
}
export type BillingOverview = Awaited<ReturnType<typeof getBillingOverview>>;
async function aiTokensThisMonth(ctx: AuthContext): Promise<number> {
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);
  const { data } = await ctx.supabase.from("ai_usage_events").select("total_tokens").eq("workspace_id", ctx.workspaceId).gte("created_at", since.toISOString()).limit(10000);
  return (data ?? []).reduce((n, r) => n + ((r.total_tokens as number) ?? 0), 0);
}
// ---------------------------------------------------------------- checkout
/** Razorpay plan IDs are created once per plan, cycle, currency and price, then cached in razorpay_plans. */
async function razorpayPlanId(plan: PlanId, cycle: Cycle, currency: Currency): Promise<string> {
  const amount = priceFor(plan, cycle, currency);
  const key = `${publicKeyId().slice(0, 14)}:${plan}:${cycle}:${currency}:${amount}`;
  const db = admin();
  const { data } = await db.from("razorpay_plans").select("razorpay_plan_id").eq("key", key).maybeSingle();
  if (data) return data.razorpay_plan_id as string;
  const created = await createPlan({
    period: cycle === "annual" ? "yearly" : "monthly",
    name: `RelayNest ${PLANS[plan].name} (${cycle}, ${currency})`,
    amount, currency, notes: { plan, cycle, currency },
  });
  await db.from("razorpay_plans").upsert({ key, razorpay_plan_id: created.id, amount, currency });
  return created.id;
}
export async function createCheckout(ctx: AuthContext, input: CheckoutInput) {
  requireWrite(ctx);
  if (!razorpayConfigured()) throw Errors.notConfigured();
  const { data } = await admin().from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("workspace_id", ctx.workspaceId).maybeSingle();
  const current = data as SubscriptionRow | null;
  if (current && current.mode === "recurring" && current.status === "active" && current.plan !== "free" && !current.cancel_at_period_end && effectivePlan(current) !== "free") {
    throw Errors.conflict("This workspace already has an active subscription. Cancel it first, then choose a new plan.");
  }
  const amount = priceFor(input.plan, input.cycle, input.currency);
  const notes = { workspace_id: ctx.workspaceId, user_id: ctx.userId, plan: input.plan, cycle: input.cycle, currency: input.currency, mode: input.mode };
  const common = { keyId: publicKeyId(), amount, currency: input.currency, name: "RelayNest", description: `${PLANS[input.plan].name} plan, billed ${input.cycle}`, email: ctx.email ?? null };
  if (input.mode === "one_time") {
    const order = await createOrder(amount, input.currency, `rn_${ctx.workspaceId.slice(0, 8)}_${Date.now()}`, notes);
    return { ...common, kind: "order" as const, orderId: order.id };
  }
  const sub = await createSubscription(await razorpayPlanId(input.plan, input.cycle, input.currency), input.cycle === "annual" ? 10 : 120, { ...notes, mode: "recurring" });
  return { ...common, kind: "subscription" as const, subscriptionId: sub.id };
}
// ---------------------------------------------------------------- UPI QR (INR, one-time)
export const upiQrInput = z.object({ plan: z.enum(["pro", "business"]), cycle: z.enum(["monthly", "annual"]) });
const QR_MINUTES = 15;
/** Creates a fixed-amount, single-use Razorpay UPI QR. The workspace is stamped in the QR notes so the payment can be matched back. */
export async function createUpiQrCheckout(ctx: AuthContext, input: z.infer<typeof upiQrInput>) {
  requireWrite(ctx);
  if (!razorpayConfigured()) throw Errors.notConfigured();
  const amount = priceFor(input.plan, input.cycle, "INR");
  const closeBy = Math.floor(Date.now() / 1000) + QR_MINUTES * 60;
  const qr = await createUpiQr({
    name: `RelayNest ${PLANS[input.plan].name}`, description: `${PLANS[input.plan].name} plan, ${input.cycle}`, amount, closeBy,
    notes: { workspace_id: ctx.workspaceId, user_id: ctx.userId, plan: input.plan, cycle: input.cycle, currency: "INR", mode: "one_time" },
  });
  if (!qr.image_url) throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "Razorpay did not return a QR image.");
  return { qrId: qr.id, imageUrl: qr.image_url, amount, currency: "INR" as const, expiresAt: new Date(closeBy * 1000).toISOString() };
}
/** Activates the plan for a payment made through a QR. Safe to call repeatedly (browser polling and the webhook both use it). */
async function activateQrPayment(notes: Record<string, string>, payment: RzpPayment) {
  if (!notes.workspace_id || (notes.plan !== "pro" && notes.plan !== "business") || notes.mode !== "one_time") return false;
  if (payment.status !== "captured" && payment.status !== "authorized") return false;
  await activateOrder({ workspaceId: notes.workspace_id, plan: notes.plan as PlanId, cycle: notes.cycle === "annual" ? "annual" : "monthly", currency: "INR", payment });
  return true;
}
/** Polled by the browser while the QR is on screen. Checks Razorpay directly, so it works even before the webhook arrives. */
export async function getUpiQrStatus(ctx: AuthContext, qrId: string) {
  requireWrite(ctx);
  if (!/^qr_[A-Za-z0-9]+$/.test(qrId)) throw Errors.invalid("Invalid QR id.");
  const qr = await fetchQr(qrId);
  const notes = notesOf(qr.notes);
  if (notes.workspace_id !== ctx.workspaceId) throw Errors.forbidden();
  const { items } = await fetchQrPayments(qrId);
  const paid = items?.find((p) => p.status === "captured" || p.status === "authorized");
  if (paid && (await activateQrPayment(notes, paid))) return { status: "paid" as const, overview: await getBillingOverview(ctx) };
  return { status: qr.status === "closed" ? ("expired" as const) : ("pending" as const), overview: null };
}
// ---------------------------------------------------------------- activation
interface Activation {
  workspaceId: string; plan: PlanId; cycle: Cycle; currency: Currency; mode: "recurring" | "one_time";
  subscriptionId?: string | null; status?: SubscriptionRow["status"];
  start?: string | null; end?: string | null; cancelAtPeriodEnd?: boolean; customerId?: string | null;
}
async function upsertSubscription(a: Activation) {
  const { error } = await admin().from("subscriptions").upsert({
    workspace_id: a.workspaceId, plan: a.plan, status: a.status ?? "active", mode: a.mode, billing_cycle: a.cycle, currency: a.currency,
    razorpay_subscription_id: a.subscriptionId ?? null, razorpay_customer_id: a.customerId ?? null,
    current_period_start: a.start ?? null, current_period_end: a.end ?? null, cancel_at_period_end: a.cancelAtPeriodEnd ?? false,
  }, { onConflict: "workspace_id" });
  if (error) throw new Error(`subscription-upsert: ${error.message}`);
  clearEntitlementCache(a.workspaceId);
}
async function ownerEmail(workspaceId: string): Promise<string | null> {
  const db = admin();
  const { data } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  if (!data) return null;
  const { data: u } = await db.auth.admin.getUserById(data.user_id as string);
  return u.user?.email ?? null;
}
/** Resolves recurring subscription status and billing period even when Razorpay returns `created` or null dates right after checkout. */
export function resolveRecurringActivation(sub: RzpSubscription, cycle: Cycle, payment?: RzpPayment) {
  const paidNow = Boolean(payment && (payment.status === "captured" || payment.status === "authorized"));
  const fallbackStart = paidNow ? new Date((payment!.created_at || Math.floor(Date.now() / 1000)) * 1000) : null;
  const start = fromUnix(sub.current_start) ?? (fallbackStart ? fallbackStart.toISOString() : null);
  const end = fromUnix(sub.current_end) ?? (fallbackStart ? periodEnd(fallbackStart, cycle).toISOString() : null);
  const status: SubscriptionRow["status"] =
    sub.status === "active" || sub.status === "authenticated" || paidNow ? "active" : "pending";
  return { status, start, end };
}

/** Stores a payment and its invoice once. Updates status from authorized -> captured on webhook without duplicating invoices. */
async function recordPayment(a: {
  workspaceId: string; plan: PlanId; cycle: Cycle; mode: string; payment: RzpPayment;
  periodStart?: string | null; periodEnd?: string | null; subscriptionId?: string | null;
}) {
  const db = admin();
  const p = a.payment;
  const status = p.status === "captured" ? "captured" : p.status === "failed" ? "failed" : p.status === "refunded" ? "refunded" : "authorized";
  const subscriptionId = p.subscription_id ?? a.subscriptionId ?? null;
  const { data: row, error } = await db.from("payments").upsert({
    workspace_id: a.workspaceId, razorpay_payment_id: p.id, razorpay_order_id: p.order_id ?? null, razorpay_subscription_id: subscriptionId,
    plan: a.plan, billing_cycle: a.cycle, mode: a.mode, amount: p.amount, currency: p.currency, status, method: p.method ?? null,
    card_network: p.card?.network ?? null, card_last4: p.card?.last4 ?? null, error_description: p.error_description ?? null,
  }, { onConflict: "razorpay_payment_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(`payment-insert: ${error.message}`);
  if (!row) {
    // Duplicate delivery (e.g. webhook arriving after browser verify): promote authorized -> captured and backfill method details.
    if (status === "captured") {
      await db.from("payments").update({
        status: "captured",
        ...(p.method ? { method: p.method } : {}),
        ...(p.card?.network ? { card_network: p.card.network } : {}),
        ...(p.card?.last4 ? { card_last4: p.card.last4 } : {}),
        ...(subscriptionId ? { razorpay_subscription_id: subscriptionId } : {}),
      }).eq("razorpay_payment_id", p.id).eq("status", "authorized");
    }
    return null;
  }
  if (status === "failed") return null; // nothing to invoice
  const { data: inv, error: invErr } = await db.from("invoices").insert({
    workspace_id: a.workspaceId, payment_id: row.id, plan: a.plan, amount: p.amount, currency: p.currency,
    description: `RelayNest ${PLANS[a.plan].name} plan (${a.cycle})`, period_start: a.periodStart ?? null, period_end: a.periodEnd ?? null,
  }).select("number").single();
  if (invErr) throw new Error(`invoice-insert: ${invErr.message}`);
  const planName = PLANS[a.plan].name;
  const nextText = a.periodEnd ? (a.mode === "one_time" ? ` Your plan is active until ${new Date(a.periodEnd).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}.` : ` Next billing date: ${new Date(a.periodEnd).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}.`) : "";
  await notifyOwners(a.workspaceId, { kind: "payment_received", title: `Payment received: ${money(p.amount, p.currency)} for ${planName}`, body: `Invoice ${inv.number as string} is ready in Billing.${nextText}` });
  const to = await ownerEmail(a.workspaceId);
  if (to) {
    const mail = paymentReceiptEmail({ plan: PLANS[a.plan].name, amount: p.amount, currency: p.currency, invoiceNumber: inv.number as string, periodEnd: a.periodEnd, appUrl: appUrl() });
    await sendEmail({ to: { email: to }, ...mail, tags: ["billing", "receipt"] });
  }
  return inv.number as string;
}
async function activateOrder(a: { workspaceId: string; plan: PlanId; cycle: Cycle; currency: Currency; payment: RzpPayment }) {
  const db = admin();
  const { data } = await db.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("workspace_id", a.workspaceId).maybeSingle();
  const cur = data as SubscriptionRow | null;
  // Buying the same plan again while it is still active extends it instead of wasting the days already paid for.
  const extend = cur && cur.mode === "one_time" && cur.plan === a.plan && effectivePlan(cur) === a.plan && cur.current_period_end;
  const start = extend ? new Date(cur!.current_period_end!) : new Date((a.payment.created_at || Math.floor(Date.now() / 1000)) * 1000);
  const end = periodEnd(start, a.cycle);
  const first = await recordPayment({ workspaceId: a.workspaceId, plan: a.plan, cycle: a.cycle, mode: "one_time", payment: a.payment, periodStart: start.toISOString(), periodEnd: end.toISOString() });
  // A repeat delivery recorded nothing, so it must not extend the period a second time.
  if (first === null && cur && cur.plan === a.plan && cur.status === "active") return;
  await upsertSubscription({ workspaceId: a.workspaceId, plan: a.plan, cycle: a.cycle, currency: a.currency, mode: "one_time", start: start.toISOString(), end: end.toISOString() });
  await notifyOwners(a.workspaceId, { kind: "plan_activated", title: `${PLANS[a.plan].name} plan is active`, body: `Your prepaid ${a.cycle === "annual" ? "year" : "month"} runs until ${end.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}. It does not renew automatically.`, dedupeHours: 0.01 });
}
async function activateRecurring(sub: RzpSubscription, payment?: RzpPayment) {
  const n = notesOf(sub.notes);
  if (!n.workspace_id || (n.plan !== "pro" && n.plan !== "business")) throw new Error("subscription-notes-missing");
  const cycle: Cycle = n.cycle === "annual" ? "annual" : "monthly";
  const resolved = resolveRecurringActivation(sub, cycle, payment);
  const a: Activation = {
    workspaceId: n.workspace_id, plan: n.plan as PlanId, cycle, currency: n.currency === "USD" ? "USD" : "INR", mode: "recurring",
    subscriptionId: sub.id, customerId: sub.customer_id, start: resolved.start, end: resolved.end, status: resolved.status,
  };
  if (payment) await recordPayment({ workspaceId: a.workspaceId, plan: a.plan, cycle: a.cycle, mode: "recurring", payment, periodStart: a.start, periodEnd: a.end, subscriptionId: sub.id });
  await upsertSubscription(a);
  if (a.status === "active") await notifyOwners(a.workspaceId, { kind: "plan_activated", title: `${PLANS[a.plan].name} plan is active`, body: a.end ? `Billing cycle refreshed. Next renewal on ${new Date(a.end).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}.` : "Your subscription is active and renews automatically.", dedupeHours: 0.01 });
}
// ---------------------------------------------------------------- browser verification
/** Called right after Razorpay Checkout succeeds so the plan unlocks immediately; the webhook is the safety net. */
export async function verifyCheckout(ctx: AuthContext, input: z.infer<typeof verifyInput>) {
  requireWrite(ctx);
  const ok = await verifyCheckoutSignature({ paymentId: input.razorpay_payment_id, orderId: input.razorpay_order_id, subscriptionId: input.razorpay_subscription_id, signature: input.razorpay_signature });
  if (!ok) throw new ApiError(400, "BAD_SIGNATURE", "The payment signature could not be verified.");
  const payment = await fetchPayment(input.razorpay_payment_id);
  if (payment.status !== "captured" && payment.status !== "authorized") throw Errors.invalid("The payment has not completed yet.");
  if (input.razorpay_order_id) {
    const order = await fetchOrder(input.razorpay_order_id);
    const n = notesOf(order.notes);
    if (n.workspace_id !== ctx.workspaceId || payment.order_id !== order.id) throw Errors.forbidden();
    if (n.plan !== "pro" && n.plan !== "business") throw Errors.invalid("Order plan metadata is missing.");
    await activateOrder({ workspaceId: ctx.workspaceId, plan: n.plan as PlanId, cycle: n.cycle === "annual" ? "annual" : "monthly", currency: n.currency === "USD" ? "USD" : "INR", payment });
  } else {
    const sub = await fetchSubscription(input.razorpay_subscription_id!);
    if (notesOf(sub.notes).workspace_id !== ctx.workspaceId) throw Errors.forbidden();
    if (payment.subscription_id && payment.subscription_id !== sub.id) throw Errors.forbidden();
    await activateRecurring(sub, payment);
  }
  return getBillingOverview(ctx);
}
export async function cancelSubscription(ctx: AuthContext, atCycleEnd: boolean) {
  requireWrite(ctx);
  const { data } = await admin().from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("workspace_id", ctx.workspaceId).maybeSingle();
  const sub = data as SubscriptionRow | null;
  if (!sub || sub.plan === "free") throw Errors.invalid("There is no paid subscription to cancel.");
  if (sub.mode === "one_time" || !sub.razorpay_subscription_id) {
    // A prepaid period cannot renew, so there is nothing to cancel at Razorpay; it simply ends on its date.
    throw Errors.invalid("This plan was bought as a one-time payment. It will end on its expiry date and does not renew.");
  }
  await rzpCancel(sub.razorpay_subscription_id, atCycleEnd);
  await admin().from("subscriptions").update({ cancel_at_period_end: atCycleEnd, ...(atCycleEnd ? {} : { status: "cancelled" }) }).eq("workspace_id", ctx.workspaceId);
  clearEntitlementCache(ctx.workspaceId);
  await notifyOwners(ctx.workspaceId, { kind: "subscription_cancelled", title: "Subscription cancelled", body: atCycleEnd ? "You keep your plan until the end of the current billing period, then return to Free." : "Your subscription was cancelled immediately." });
  return getBillingOverview(ctx);
}
// ---------------------------------------------------------------- webhook
type RzpEvent = {
  event: string;
  payload: { subscription?: { entity: RzpSubscription }; payment?: { entity: RzpPayment }; order?: { entity: { id: string; notes?: unknown } }; qr_code?: { entity: { id: string; notes?: unknown } } };
};
/** Verifies and applies a Razorpay webhook. Duplicate deliveries (same event id) are ignored. */
export async function handleRazorpayWebhook(rawBody: string, signature: string | null, eventId: string | null): Promise<"ok" | "duplicate" | "ignored"> {
  if (!(await verifyWebhookSignature(rawBody, signature))) throw new ApiError(401, "BAD_SIGNATURE", "Invalid webhook signature.");
  let evt: RzpEvent;
  try { evt = JSON.parse(rawBody) as RzpEvent; } catch { throw new ApiError(400, "MALFORMED_JSON", "Body must be JSON."); }
  const db = admin();
  if (eventId) {
    const { error } = await db.from("billing_events").insert({ event_id: eventId, event: evt.event });
    if (error) return error.code === "23505" ? "duplicate" : "ignored";
  }
  try {
    await applyEvent(evt);
    return "ok";
  } catch (e) {
    // Let Razorpay retry: forget the event id so the next delivery is processed.
    if (eventId) await db.from("billing_events").delete().eq("event_id", eventId);
    throw e;
  }
}
async function applyEvent(evt: RzpEvent) {
  const sub = evt.payload.subscription?.entity;
  const payment = evt.payload.payment?.entity;
  const db = admin();
  switch (evt.event) {
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.resumed":
      if (sub) await activateRecurring(sub, payment);
      return;
    case "subscription.charged":
      if (sub) await activateRecurring(sub, payment);
      return;
    case "subscription.pending":
    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed": {
      if (!sub) return;
      const status = evt.event.split(".")[1] as "pending" | "halted" | "cancelled" | "completed";
      const { data } = await db.from("subscriptions").update({ status, current_period_end: fromUnix(sub.current_end) ?? undefined, cancel_at_period_end: false }).eq("razorpay_subscription_id", sub.id).select("workspace_id, plan").maybeSingle();
      if (data) {
        clearEntitlementCache(data.workspace_id as string);
        await notifyOwners(data.workspace_id as string, { kind: status === "halted" ? "payment_failed" : "subscription_cancelled", title: status === "halted" ? `${PLANS[data.plan as PlanId].name} subscription paused: payments failed` : `${PLANS[data.plan as PlanId].name} subscription ${status}`, body: status === "halted" ? "Update your payment method in Billing to keep your plan." : "Your workspace returns to the Free plan when the paid period ends." });
        if (status === "completed" || status === "halted") {
          const to = await ownerEmail(data.workspace_id as string);
          if (to) await sendEmail({ to: { email: to }, ...(status === "halted" ? paymentFailedEmail({ plan: PLANS[data.plan as PlanId].name, appUrl: appUrl() }) : subscriptionEndedEmail({ plan: PLANS[data.plan as PlanId].name, appUrl: appUrl() })), tags: ["billing"] });
        }
      }
      return;
    }
    case "order.paid": {
      const order = evt.payload.order?.entity;
      const n = notesOf(order?.notes);
      if (!payment || !n.workspace_id || n.mode !== "one_time" || (n.plan !== "pro" && n.plan !== "business")) return;
      await activateOrder({ workspaceId: n.workspace_id, plan: n.plan as PlanId, cycle: n.cycle === "annual" ? "annual" : "monthly", currency: n.currency === "USD" ? "USD" : "INR", payment });
      return;
    }
    case "payment.captured": {
      if (!payment) return;
      if (payment.subscription_id) {
        const fetchedSub = await fetchSubscription(payment.subscription_id);
        await activateRecurring(fetchedSub, payment);
        return;
      }
      if (payment.order_id) {
        const fetchedOrder = await fetchOrder(payment.order_id);
        const n = notesOf(fetchedOrder.notes);
        if (n.workspace_id && n.mode === "one_time" && (n.plan === "pro" || n.plan === "business")) {
          await activateOrder({ workspaceId: n.workspace_id, plan: n.plan as PlanId, cycle: n.cycle === "annual" ? "annual" : "monthly", currency: n.currency === "USD" ? "USD" : "INR", payment });
          return;
        }
      }
      // Fallback: promote any existing authorized payment row to captured.
      await db.from("payments").update({
        status: "captured",
        ...(payment.method ? { method: payment.method } : {}),
        ...(payment.card?.network ? { card_network: payment.card.network } : {}),
        ...(payment.card?.last4 ? { card_last4: payment.card.last4 } : {}),
      }).eq("razorpay_payment_id", payment.id).eq("status", "authorized");
      return;
    }
    case "qr_code.credited": {
      const qr = evt.payload.qr_code?.entity;
      if (payment && qr) await activateQrPayment(notesOf(qr.notes), payment);
      return;
    }
    case "payment.failed": {
      if (!payment) return;
      const n = notesOf(payment.notes);
      let workspaceId = n.workspace_id;
      let plan = n.plan as PlanId | undefined;
      if (!workspaceId && payment.subscription_id) {
        const { data } = await db.from("subscriptions").select("workspace_id, plan").eq("razorpay_subscription_id", payment.subscription_id).maybeSingle();
        workspaceId = (data?.workspace_id as string | undefined) ?? undefined;
        plan = data?.plan as PlanId | undefined;
      }
      if (!workspaceId || !plan || !(plan in PLANS)) return;
      await recordPayment({ workspaceId, plan, cycle: n.cycle === "annual" ? "annual" : "monthly", mode: payment.subscription_id ? "recurring" : "one_time", payment: { ...payment, status: "failed" } });
      const to = await ownerEmail(workspaceId);
      await notifyOwners(workspaceId, { kind: "payment_failed", title: `Payment failed for ${PLANS[plan].name}`, body: payment.error_description ?? "We could not collect payment. Update your payment method in Billing." });
      if (to) await sendEmail({ to: { email: to }, ...paymentFailedEmail({ plan: PLANS[plan].name, appUrl: appUrl() }), tags: ["billing"] });
      return;
    }
    case "payment.refunded":
    case "refund.processed": {
      const id = payment?.id;
      if (!id) return;
      const { data } = await db.from("payments").update({ status: "refunded" }).eq("razorpay_payment_id", id).select("id, workspace_id, mode").maybeSingle();
      if (!data) return;
      await db.from("invoices").update({ status: "refunded" }).eq("payment_id", data.id);
      if (data.mode === "one_time") {
        await db.from("subscriptions").update({ status: "expired" }).eq("workspace_id", data.workspace_id).eq("mode", "one_time");
        clearEntitlementCache(data.workspace_id as string);
      }
      return;
    }
    default:
      return;
  }
}
