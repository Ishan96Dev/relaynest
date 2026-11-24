import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { accountDeletedEmail } from "@backend/server/email/templates";

test("accountDeletedEmail renders Aurora confirmation template safely without XSS", () => {
  const { subject, html } = accountDeletedEmail({
    email: "ishan@example.com",
    name: '<script>alert(1)</script>Ishan',
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
  assert.ok(!html.includes("7021133070"), "Phone number must not appear in transactional emails");
  assert.ok(!html.includes("tel:"), "tel: links must not appear in transactional emails");
  assert.ok(html.includes('xmlns:v="urn:schemas-microsoft-com:vml"'), "Must include Outlook VML namespace");
  assert.ok(html.includes("<v:roundrect"), "Must include Outlook bulletproof VML button");
  assert.ok(html.includes('bgcolor="#131130"'), "Must include solid bgcolor fallback for Outlook/Gmail");
});

test("supabase/templates includes all 10 branded Outlook/Gmail-safe HTML templates without phone number", () => {
  const tplDir = path.resolve(process.cwd(), "supabase", "templates");
  const expected = [
    "confirmation.html",
    "invite.html",
    "magic_link.html",
    "email_change.html",
    "recovery.html",
    "reset_password.html",
    "reauthentication.html",
    "password_changed.html",
    "email_changed.html",
    "account_deleted.html",
  ];

  for (const file of expected) {
    const full = path.join(tplDir, file);
    assert.ok(fs.existsSync(full), `Missing template: ${file}`);
    const content = fs.readFileSync(full, "utf8");
    assert.ok(content.includes("RelayNest"), `${file} missing RelayNest header`);
    assert.ok(content.includes("{{ .SiteURL }}/privacy"), `${file} missing footer policy link`);
    assert.ok(content.includes("logo-icon-128.png"), `${file} missing logo image reference`);
    assert.ok(!content.includes("7021133070") && !content.includes("tel:"), `${file} must not include phone number`);
    assert.ok(!content.includes("data:image/"), `${file} must use HTTPS image URL instead of Gmail-blocked data URI`);
    assert.ok(content.includes('xmlns:v="urn:schemas-microsoft-com:vml"'), `${file} missing Outlook VML namespace`);
    assert.ok(content.includes('mso-table-lspace:0pt'), `${file} missing Outlook table reset`);
    assert.ok(!content.includes("@keyframes"), `${file} must not embed @keyframes that break Gmail CSS parsing`);
  }

  const deletedHtml = fs.readFileSync(path.join(tplDir, "account_deleted.html"), "utf8");
  assert.ok(deletedHtml.includes("Account Deletion"));
  assert.ok(deletedHtml.includes("{{ .Email }}"));
  assert.ok(deletedHtml.includes("{{ .SiteURL }}/signup"));
  assert.ok(deletedHtml.includes("<v:roundrect"));
});
