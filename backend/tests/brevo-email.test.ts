import assert from "node:assert/strict";
import test from "node:test";
import { brevoEnv, isBrevoSmtpKey } from "@backend/lib/env/integrations";
import { isEmailConfigured, probeBrevoHealth, sendEmail } from "@backend/server/email/mailer";

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const keys = [
    "BREVO_API_KEY",
    "MAIL_FROM_ADDRESS",
    "MAIL_FROM_NAME",
    "BREVO_SENDER_EMAIL",
    "BREVO_FROM_EMAIL",
    "BREVO_SENDER_NAME",
  ];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
  const restore = () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  try {
    const res = fn();
    if (res && typeof (res as Promise<void>).finally === "function") {
      return (res as Promise<void>).finally(restore);
    }
    restore();
  } catch (err) {
    restore();
    throw err;
  }
}

test("isBrevoSmtpKey distinguishes SMTP keys (xsmtpsib-) from v3 API keys (xkeysib-)", () => {
  assert.equal(isBrevoSmtpKey("xsmtpsib-abc123"), true);
  assert.equal(isBrevoSmtpKey("xkeysib-abc123"), false);
  assert.equal(isBrevoSmtpKey(undefined), false);
});

test("brevoEnv supports MAIL_FROM_ADDRESS and BREVO_SENDER_EMAIL aliases", () => {
  withEnv({ BREVO_API_KEY: "xkeysib-test-1234", BREVO_SENDER_EMAIL: "noreply@example.com" }, () => {
    const env = brevoEnv();
    assert.equal(env.apiKey, "xkeysib-test-1234");
    assert.equal(env.isSmtpKey, false);
    assert.equal(env.fromAddress, "noreply@example.com");
    assert.equal(env.fromName, "RelayNest");
    assert.equal(isEmailConfigured(), true);
  });
});

test("isEmailConfigured and sendEmail reject xsmtpsib- SMTP keys without calling Brevo HTTP API", async () => {
  await withEnv(
    { BREVO_API_KEY: "xsmtpsib-wrong-key", MAIL_FROM_ADDRESS: "verified@example.com" },
    async () => {
      assert.equal(isEmailConfigured(), false);
      let called = false;
      const fakeFetch: typeof fetch = async () => {
        called = true;
        return new Response("{}", { status: 200 });
      };
      const sent = await sendEmail(
        { to: { email: "user@example.com" }, subject: "Test", html: "<p>Hi</p>" },
        fakeFetch,
      );
      assert.equal(sent, false);
      assert.equal(called, false);

      const probe = await probeBrevoHealth(fakeFetch);
      assert.equal(probe.ok, false);
      assert.equal(probe.status, "down");
      assert.match(probe.detail, /xsmtpsib-/);
      assert.match(probe.detail, /xkeysib-/);
    },
  );
});

test("probeBrevoHealth reports unconfigured when API key is valid but MAIL_FROM_ADDRESS is missing", async () => {
  await withEnv({ BREVO_API_KEY: "xkeysib-valid-key" }, async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ email: "owner@example.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const probe = await probeBrevoHealth(fakeFetch);
    assert.equal(probe.ok, false);
    assert.equal(probe.status, "unconfigured");
    assert.match(probe.detail, /MAIL_FROM_ADDRESS/);
    assert.match(probe.detail, /owner@example\.com/);
  });
});

test("probeBrevoHealth reports down on HTTP 401 and up when key and sender are both valid", async () => {
  await withEnv(
    { BREVO_API_KEY: "xkeysib-bad-key", MAIL_FROM_ADDRESS: "verified@example.com" },
    async () => {
      const rejectFetch: typeof fetch = async () =>
        new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 });
      const rejected = await probeBrevoHealth(rejectFetch);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.status, "down");
      assert.match(rejected.detail, /HTTP 401/);

      const okFetch: typeof fetch = async () =>
        new Response(JSON.stringify({ email: "verified@example.com" }), { status: 200 });
      const healthy = await probeBrevoHealth(okFetch);
      assert.equal(healthy.ok, true);
      assert.equal(healthy.status, "up");
      assert.match(healthy.detail, /verified@example\.com/);

      const sent = await sendEmail(
        { to: { email: "user@example.com" }, subject: "Receipt", html: "<p>Paid</p>" },
        async () => new Response(JSON.stringify({ messageId: "<123>" }), { status: 201 }),
      );
      assert.equal(sent, true);
    },
  );
});
