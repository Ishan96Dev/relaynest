import "server-only";
import { razorpayEnv } from "@backend/lib/env/integrations";
import { ApiError, Errors } from "@backend/lib/http/api";
import { safeEqual } from "@backend/lib/crypto";
/** Thin Razorpay REST client built on fetch and WebCrypto, so it runs on Node and Cloudflare Workers (the Node SDK does not). */
const BASE = "https://api.razorpay.com/v1";
const enc = new TextEncoder();
export function razorpayConfigured() {
  const e = razorpayEnv();
  return Boolean(e.keyId && e.keySecret);
}
export function publicKeyId(): string {
  const id = razorpayEnv().keyId;
  if (!id) throw Errors.notConfigured();
  return id;
}
async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = razorpayEnv();
  if (!keyId || !keySecret) throw Errors.notConfigured();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw Errors.upstream("Could not reach Razorpay.");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { code?: string; description?: string } }) | null;
  if (!res.ok || !json) {
    // Razorpay's description is safe to show (it never echoes credentials) and tells the owner what to fix, e.g. "International payments not enabled".
    const description = json?.error?.description;
    console.error("[razorpay]", method, path, res.status, json?.error?.code ?? "");
    throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", description ? `Razorpay: ${description}` : "Razorpay returned an error.");
  }
  return json;
}
export interface RzpOrder { id: string; amount: number; currency: string; status: string }
export interface RzpPlan { id: string }
export interface RzpSubscription {
  id: string; status: string; plan_id: string; current_start?: number | null; current_end?: number | null; notes?: Record<string, string> | unknown[];
  customer_id?: string | null; paid_count?: number; ended_at?: number | null;
}
export interface RzpPayment {
  id: string; amount: number; currency: string; status: string; order_id?: string | null; subscription_id?: string | null; method?: string;
  card?: { network?: string; last4?: string } | null; error_description?: string | null; notes?: Record<string, string> | unknown[]; created_at: number;
}
export const fetchOrder = (id: string) => call<RzpOrder & { notes?: Record<string, string> | unknown[] }>("GET", `/orders/${encodeURIComponent(id)}`);
export const createOrder = (amount: number, currency: string, receipt: string, notes: Record<string, string>) =>
  call<RzpOrder>("POST", "/orders", { amount, currency, receipt: receipt.slice(0, 40), notes });
export const createPlan = (a: { period: "monthly" | "yearly"; name: string; amount: number; currency: string; notes: Record<string, string> }) =>
  call<RzpPlan>("POST", "/plans", { period: a.period, interval: 1, item: { name: a.name, amount: a.amount, currency: a.currency }, notes: a.notes });
export const createSubscription = (planId: string, totalCount: number, notes: Record<string, string>) =>
  call<RzpSubscription>("POST", "/subscriptions", { plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: 1, notes });
export const fetchSubscription = (id: string) => call<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
export const cancelSubscription = (id: string, atCycleEnd: boolean) =>
  call<RzpSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
export interface RzpQr { id: string; image_url: string | null; status: string; close_by?: number | null; payment_amount?: number | null; notes?: Record<string, string> | unknown[] }
/** Single-use, fixed-amount UPI QR. Razorpay closes it after one payment or at close_by (minimum 2 minutes ahead). */
export const createUpiQr = (a: { name: string; description: string; amount: number; closeBy: number; notes: Record<string, string> }) =>
  call<RzpQr>("POST", "/payments/qr_codes", { type: "upi_qr", name: a.name.slice(0, 40), usage: "single_use", fixed_amount: true, payment_amount: a.amount, description: a.description.slice(0, 120), close_by: a.closeBy, notes: a.notes });
export const fetchQr = (id: string) => call<RzpQr>("GET", `/payments/qr_codes/${encodeURIComponent(id)}`);
export const fetchQrPayments = (id: string) => call<{ items: RzpPayment[] }>("GET", `/payments/qr_codes/${encodeURIComponent(id)}/payments`);
export const fetchPayment = (id: string) => call<RzpPayment>("GET", `/payments/${encodeURIComponent(id)}`);
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Checks the signature Razorpay Checkout returns to the browser after a successful payment. */
export async function verifyCheckoutSignature(a: { paymentId: string; orderId?: string; subscriptionId?: string; signature: string }): Promise<boolean> {
  const secret = razorpayEnv().keySecret;
  if (!secret) throw Errors.notConfigured();
  const payload = a.orderId ? `${a.orderId}|${a.paymentId}` : `${a.paymentId}|${a.subscriptionId}`;
  return safeEqual(await hmacSha256Hex(secret, payload), a.signature.toLowerCase());
}
/** Checks the X-Razorpay-Signature header against the raw request body. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = razorpayEnv().webhookSecret;
  if (!secret || !signature) return false;
  return safeEqual(await hmacSha256Hex(secret, rawBody), signature.toLowerCase());
}
