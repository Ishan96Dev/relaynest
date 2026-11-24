import { describe, it } from "node:test";
import { expect } from "./expect";
import { periodEnd, priceFor } from "../src/lib/billing/plans";
import { effectivePlan } from "../src/server/billing/entitlements";
import { hmacSha256Hex } from "../src/server/billing/razorpay";
import { checkoutInput, resolveRecurringActivation } from "../src/server/billing/service";
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
describe("plans", () => {
  it("prices monthly and annual (20% off) in both currencies", () => {
    expect(priceFor("pro", "monthly", "USD")).toBe(900);
    expect(priceFor("pro", "annual", "USD")).toBe(8600);
    expect(priceFor("business", "annual", "INR")).toBe(2303000);
    expect(priceFor("free", "annual", "INR")).toBe(0);
  });
  it("adds one month or one year", () => {
    expect(periodEnd(new Date("2026-01-31T00:00:00Z"), "annual").getUTCFullYear()).toBe(2027);
  });
});
describe("effectivePlan", () => {
  it("is free without a subscription", () => {
    expect(effectivePlan(null)).toBe("free");
  });
  it("keeps a recurring plan while active, with a grace for late webhooks", () => {
    expect(effectivePlan({ plan: "pro", status: "active", mode: "recurring", current_period_end: at(10) })).toBe("pro");
    expect(effectivePlan({ plan: "pro", status: "active", mode: "recurring", current_period_end: at(-1) })).toBe("pro");
    expect(effectivePlan({ plan: "pro", status: "active", mode: "recurring", current_period_end: at(-5) })).toBe("free");
  });
  it("keeps access until the paid-through date after cancelling", () => {
    expect(effectivePlan({ plan: "business", status: "cancelled", mode: "recurring", current_period_end: at(5) })).toBe("business");
    expect(effectivePlan({ plan: "business", status: "cancelled", mode: "recurring", current_period_end: at(-1) })).toBe("free");
  });
  it("ends a one-time purchase exactly at its end date", () => {
    expect(effectivePlan({ plan: "pro", status: "active", mode: "one_time", current_period_end: at(2) })).toBe("pro");
    expect(effectivePlan({ plan: "pro", status: "active", mode: "one_time", current_period_end: at(-0.01) })).toBe("free");
    expect(effectivePlan({ plan: "pro", status: "expired", mode: "one_time", current_period_end: at(20) })).toBe("free");
  });
});
describe("razorpay signature", () => {
  it("matches the documented HMAC-SHA256 hex format", async () => {
    // Known HMAC-SHA256 vector (RFC 4231 style): key "key", message "The quick brown fox jumps over the lazy dog".
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });
});
describe("checkoutInput", () => {
  it("defaults to INR and rejects unsupported USD checkout", () => {
    expect(checkoutInput.parse({ plan: "pro", cycle: "monthly", mode: "subscription" }).currency).toBe("INR");
    expect(checkoutInput.safeParse({ plan: "pro", cycle: "monthly", currency: "USD", mode: "subscription" }).success).toBe(false);
  });
});
describe("resolveRecurringActivation", () => {
  it("activates immediately with fallback period when Razorpay returns created right after verified checkout", () => {
    const createdAt = Math.floor(Date.UTC(2026, 10, 25, 0, 0, 0) / 1000);
    const res = resolveRecurringActivation(
      { id: "sub_test", status: "created", plan_id: "plan_test", current_start: null, current_end: null },
      "monthly",
      { id: "pay_test", amount: 74900, currency: "INR", status: "authorized", created_at: createdAt },
    );
    expect(res.status).toBe("active");
    expect(res.start).toBe("2026-11-25T00:00:00.000Z");
    expect(res.end).toBe("2026-12-25T00:00:00.000Z");
    expect(effectivePlan({ plan: "pro", status: res.status, mode: "recurring", current_period_end: res.end }, createdAt * 1000 + 1000)).toBe("pro");
  });
  it("keeps pending when no verified payment exists yet", () => {
    const res = resolveRecurringActivation(
      { id: "sub_test", status: "created", plan_id: "plan_test", current_start: null, current_end: null },
      "monthly",
    );
    expect(res.status).toBe("pending");
    expect(res.start).toBe(null);
    expect(res.end).toBe(null);
  });
});
