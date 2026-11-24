import test from "node:test";
import assert from "node:assert/strict";
import { assessPasswordStrength } from "@backend/lib/security/password";
import { assertNoPhishingUrlIndicators, escapeHtml, hasTrustedOrigin, sanitizeRedirectPath } from "@backend/lib/security/phishing";
import { rateLimit } from "@backend/server/security/rate-limit";

test("Password policy blocks common breached passwords and enforces mixed complexity", () => {
  assert.equal(assessPasswordStrength("Password123!").isAcceptable, false);
  assert.equal(assessPasswordStrength("12345678").isAcceptable, false);
  assert.equal(assessPasswordStrength("short").isAcceptable, false);
  assert.equal(assessPasswordStrength("R3layNest!Vault#9").isAcceptable, true);
  assert.equal(assessPasswordStrength("GoodPass123").score >= 2, true);
});

test("Anti-phishing redirect and URL guards block open redirects and homographs", () => {
  assert.equal(sanitizeRedirectPath("https://phish.example.com"), "/dashboard");
  assert.equal(sanitizeRedirectPath("//phish.example.com"), "/dashboard");
  assert.equal(sanitizeRedirectPath("/%2f%2fphish.example.com"), "/dashboard");
  assert.equal(sanitizeRedirectPath("/\\phish.example.com"), "/dashboard");
  assert.equal(sanitizeRedirectPath("/user@phish.example.com"), "/dashboard");
  assert.equal(sanitizeRedirectPath("/bots/new?tab=ai"), "/bots/new?tab=ai");

  assert.throws(() => assertNoPhishingUrlIndicators(new URL("https://xn--pple-43d.com/hook")));
  assert.throws(() => assertNoPhishingUrlIndicators(new URL("https://user:pass@example.com/hook")));
  assert.throws(() => assertNoPhishingUrlIndicators(new URL("https://93.184.216.34/hook")));
  assert.doesNotThrow(() => assertNoPhishingUrlIndicators(new URL("https://hooks.slack.com/services/T00/B00/XYZ")));
});

test("Email HTML escaper neutralizes script/link injection and CSRF origin guard blocks cross-origin mutations", () => {
  const escaped = escapeHtml(`<script>alert(1)</script><a href="https://evil.test">Reset</a>`);
  assert.ok(!escaped.includes("<script>"));
  assert.ok(escaped.includes("&lt;script&gt;"));

  const okReq = new Request("https://relaynest.app/api/admin/login", {
    method: "POST",
    headers: { host: "relaynest.app", origin: "https://relaynest.app" },
  });
  const evilReq = new Request("https://relaynest.app/api/admin/login", {
    method: "POST",
    headers: { host: "relaynest.app", origin: "https://evil-phisher.com" },
  });
  assert.equal(hasTrustedOrigin(okReq), true);
  assert.equal(hasTrustedOrigin(evilReq), false);
});

test("API sliding-window rate limiter enforces thresholds cleanly with 429 RATE_LIMITED", () => {
  const key = `unit-test-${Date.now()}`;
  const r1 = rateLimit(key, 3, 10_000);
  const r2 = rateLimit(key, 3, 10_000);
  const r3 = rateLimit(key, 3, 10_000);
  assert.equal(r1.remaining, 2);
  assert.equal(r2.remaining, 1);
  assert.equal(r3.remaining, 0);
  assert.throws(() => rateLimit(key, 3, 10_000), (err: unknown) => (err as { status?: number; code?: string }).status === 429 && (err as { code?: string }).code === "RATE_LIMITED");
});
