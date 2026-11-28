import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  accountDeletedEmail,
  automationFailedEmail,
  DEFAULT_EMAIL_LOGO_URL,
  notificationEmail,
  paymentFailedEmail,
  paymentReceiptEmail,
  resolveEmailLogoUrl,
  subscriptionEndedEmail,
} from "@backend/server/email/templates";

test("accountDeletedEmail renders Aurora confirmation template safely without XSS", () => {
  const { subject, html } = accountDeletedEmail({
    email: "ishan@example.com",
    name: "<script>alert(1)</script>Ishan",
    deletedAt: "2026-11-24T16:10:00.000Z",
    workspaceCount: 2,
    appUrl: "https://relaynest.example.com",
  });

  assert.match(subject, /deleted/i);
  assert.ok(!html.includes("<script>alert(1)</script>"), "Name must be HTML-escaped");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;Ishan"));
  assert.ok(html.includes("ishan@example.com"));
  assert.ok(html.includes("2 owned workspaces"));
  assert.ok(html.includes("https://relaynest.example.com/signup"));
  assert.ok(html.includes("https://relaynest.example.com/privacy"));
  assert.ok(html.includes("ishanrock1234@gmail.com"));
  assert.ok(html.includes("logo-icon-128.png"), "Must render RelayNest brand logo");
  assert.ok(!html.includes("7021133070"), "Phone number must not appear in transactional emails");
  assert.ok(!html.includes("tel:"), "tel: links must not appear in transactional emails");
  assert.ok(html.includes('xmlns:v="urn:schemas-microsoft-com:vml"'), "Must include Outlook VML namespace");
  assert.ok(html.includes("<v:roundrect"), "Must include Outlook bulletproof VML button");
  assert.ok(html.includes('bgcolor="#131130"'), "Must include solid bgcolor fallback for Outlook/Gmail");
});

test("notificationEmail renders full Aurora logo, VML CTA button, and rich sign-in details", () => {
  const rendered = notificationEmail({
    kind: "login_detected",
    category: "login",
    title: "New sign-in detected",
    body: "You signed in to your RelayNest account with email and password.",
    recipientEmail: "ishan@example.com",
    recipientName: "Ishan <img src=x onerror=alert(1)>",
    workspaceName: "RelayNest Studio",
    actionUrl: "/settings/security",
    appUrl: "http://localhost:3000",
    occurredAt: new Date("2026-11-27T14:18:00.000Z"),
    timezone: "Asia/Kolkata",
    metadata: {
      method: "password",
      ip: "203.0.113.42",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    },
  });

  assert.equal(rendered.subject, "[RelayNest] New sign-in detected");
  // Even on localhost, logo resolves to a public HTTPS PNG so Outlook/Gmail never show a missing logo
  const resolvedLocalLogo = resolveEmailLogoUrl("http://localhost:3000");
  assert.match(resolvedLocalLogo, /^https:\/\/.*\/logo-icon-128\.png$/);
  assert.ok(DEFAULT_EMAIL_LOGO_URL.startsWith("https://"));
  assert.ok(rendered.html.includes('alt="RelayNest logo"'), "Must render RelayNest logo image");
  assert.ok(rendered.html.includes("https://"), "Logo src must be public HTTPS");
  assert.ok(rendered.html.includes("logo-icon-128.png"), "Logo must reference logo-icon-128.png");
  assert.ok(rendered.html.includes("Telegram Bot &amp; AI Platform"), "Must include RelayNest brand subtitle");
  assert.ok(rendered.html.includes("Sign-In Security Alert"), "Must include category pill badge");
  assert.ok(rendered.html.includes("<v:roundrect"), "Must include Outlook VML button");
  assert.ok(rendered.html.includes("background-color:#6C47FF"), "Must include solid button background-color for Outlook Web");
  assert.ok(rendered.html.includes("Review Security &amp; Sessions"), "Must include security CTA button label");
  assert.ok(rendered.html.includes("Event Details"), "Must include structured Event Details card");
  assert.ok(rendered.html.includes("RelayNest Studio"), "Must include workspace name");
  assert.ok(rendered.html.includes("Email &amp; Password"), "Must include authentication method");
  assert.ok(rendered.html.includes("Microsoft Edge on Windows"), "Must summarize browser and OS");
  assert.ok(rendered.html.includes("203.0.113.42"), "Must include client IP address");
  assert.ok(rendered.html.includes("Was this you?"), "Must include security advisory guidance");
  assert.ok(rendered.html.includes("/settings/notifications"), "Must include notification preferences link");
  assert.ok(!rendered.html.includes("<img src=x onerror=alert(1)>"), "Must escape recipient name against XSS");
  assert.ok(rendered.text.includes("Microsoft Edge on Windows"), "Plain-text body must include device summary");
});

test("transactional billing and automation emails include logo, badge, structured summary tables, and VML buttons", () => {
  const receipt = paymentReceiptEmail({
    plan: "Pro",
    amount: 74900,
    currency: "INR",
    invoiceNumber: "INV-2026-0042",
    periodEnd: "2026-12-28T00:00:00.000Z",
    appUrl: "https://relaynest.example.com",
  });
  assert.ok(receipt.html.includes("Billing Receipt"));
  assert.ok(receipt.html.includes("Receipt Summary"));
  assert.ok(receipt.html.includes("INV-2026-0042"));
  assert.ok(receipt.html.includes("logo-icon-128.png"));
  assert.ok(receipt.html.includes("<v:roundrect"));

  const failed = paymentFailedEmail({ plan: "Pro", appUrl: "https://relaynest.example.com" });
  assert.ok(failed.html.includes("Billing Alert"));
  assert.ok(failed.html.includes("Update Payment Method"));

  const ended = subscriptionEndedEmail({ plan: "Business", appUrl: "https://relaynest.example.com" });
  assert.ok(ended.html.includes("Plan Transition Summary"));
  assert.ok(ended.html.includes("Free Plan"));

  const autoFail = automationFailedEmail({
    name: "Daily Digest",
    error: "Webhook HTTP 502 Bad Gateway",
    appUrl: "https://relaynest.example.com",
  });
  assert.ok(autoFail.html.includes("Execution Summary"));
  assert.ok(autoFail.html.includes("Webhook HTTP 502 Bad Gateway"));
});

test("supabase/templates includes all 10 branded Outlook/Gmail-safe HTML templates without phone number", () => {
  const tplDir = path.resolve(process.cwd(), "supabase", "templates");
  const expected = [
    "confirmation.html",
    "invite.html",
    "magic_link.html",
    "email_change.html",
    "email_changed.html",
    "recovery.html",
    "reset_password.html",
    "reauthentication.html",
    "password_changed.html",
    "account_deleted.html",
  ];

  for (const file of expected) {
    const full = path.join(tplDir, file);
    assert.ok(fs.existsSync(full), `Missing template: ${file}`);
    const content = fs.readFileSync(full, "utf8");
    assert.ok(content.includes("RelayNest"), `${file} missing RelayNest header`);
    assert.ok(content.includes("{{ .SiteURL }}/privacy"), `${file} missing footer policy link`);
    assert.ok(content.includes("https://"), `${file} logo must use HTTPS URL`);
    assert.ok(content.includes("logo-icon-128.png"), `${file} missing logo image reference`);
    assert.ok(!content.includes("7021133070") && !content.includes("tel:"), `${file} must not include phone number`);
    assert.ok(!content.includes("data:image/"), `${file} must use HTTPS image URL instead of Gmail-blocked data URI`);
    assert.ok(content.includes('xmlns:v="urn:schemas-microsoft-com:vml"'), `${file} missing Outlook VML namespace`);
    assert.ok(content.includes("mso-table-lspace:0pt"), `${file} missing Outlook table reset`);
    assert.ok(!content.includes("@keyframes"), `${file} must not embed @keyframes that break Gmail CSS parsing`);
  }

  const deletedHtml = fs.readFileSync(path.join(tplDir, "account_deleted.html"), "utf8");
  assert.ok(deletedHtml.includes("Account Deletion"));
  assert.ok(deletedHtml.includes("Deletion Summary"));
  assert.ok(deletedHtml.includes("{{ .Email }}"));
  assert.ok(deletedHtml.includes("{{ .SiteURL }}/signup"));
  assert.ok(deletedHtml.includes("<v:roundrect"));
});
