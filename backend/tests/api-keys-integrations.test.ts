import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiSpec, API_SCOPE_META, INTEGRATION_EVENT_META } from "@backend/lib/api/openapi";
import { maskWebhookUrl, sha256Hex, signWebhookPayload } from "@backend/lib/crypto";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

test("OpenAPI 3.1 spec lists core endpoints, bearer scheme, and valid scopes", () => {
  const spec = buildOpenApiSpec("https://relaynest.app");
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.components.securitySchemes.BearerApiKey);
  assert.ok(spec.paths["/api/v1/bots"]);
  assert.ok(spec.paths["/api/v1/integrations"]);
  assert.ok(spec.paths["/api/v1/settings/api-keys"]);
  assert.ok(spec.paths["/api/v1/analytics"]);
  assert.ok(API_SCOPE_META.length >= 8);
  assert.ok(INTEGRATION_EVENT_META.length >= 6);
});

test("Webhook HMAC signatures and URL masking are deterministic and never leak secret tokens", async () => {
  const payload = JSON.stringify({ event: "integration.tested", ok: true });
  const sig1 = await signWebhookPayload(payload, "super-secret-123");
  const sig2 = await signWebhookPayload(payload, "super-secret-123");
  assert.equal(sig1, sig2);
  assert.ok(sig1.startsWith("sha256="));

  const masked = maskWebhookUrl("https://hooks.slack.com/services/T000/B000/secretSuffixXYZ");
  assert.equal(masked, "https://hooks.slack.com/•••xXYZ");
  assert.ok(!masked.includes("services/T000"));
});

test("API key hashing is collision-resistant hex SHA-256 and webhook URLs obey SSRF checks", async () => {
  const h = await sha256Hex("rnk_live_example_token_123456");
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.throws(() => assertSafeOutboundUrl("http://hooks.slack.com/services/123"));
  assert.throws(() => assertSafeOutboundUrl("https://169.254.169.254/latest/meta-data"));
  assert.ok(assertSafeOutboundUrl("https://hooks.slack.com/services/T00/B00/XYZ"));
});
