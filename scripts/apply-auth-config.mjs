// Applies RelayNest's Supabase Auth setup to the hosted project through the Management API:
// Brevo SMTP, Google sign-in, redirect URLs, and the branded email templates in supabase/templates.
//
//   node --env-file=.env scripts/apply-auth-config.mjs           # dry run: prints what would change (secrets masked)
//   node --env-file=.env scripts/apply-auth-config.mjs --apply   # sends the PATCH
//
// Required env: SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens), NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_APP_URL, BREVO_SMTP_LOGIN, BREVO_SMTP_KEY, MAIL_FROM_ADDRESS.
// Optional: MAIL_FROM_NAME (default RelayNest), GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (omit to leave Google untouched).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apply = process.argv.includes("--apply");
const env = process.env;
const missing = ["SUPABASE_ACCESS_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "BREVO_SMTP_LOGIN", "BREVO_SMTP_KEY", "MAIL_FROM_ADDRESS"].filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "templates");
const tpl = (name) => readFileSync(path.join(dir, `${name}.html`), "utf8");

const body = {
  site_url: appUrl,
  uri_allow_list: [`${appUrl}/auth/callback`, "http://localhost:3000/auth/callback"].join(","),
  // Brevo SMTP relay. The login is the SMTP login shown in Brevo > SMTP & API (not your account email); the key is an SMTP key.
  smtp_host: "smtp-relay.brevo.com",
  smtp_port: "587",
  smtp_user: env.BREVO_SMTP_LOGIN,
  smtp_pass: env.BREVO_SMTP_KEY,
  smtp_admin_email: env.MAIL_FROM_ADDRESS, // must be a verified sender in Brevo
  smtp_sender_name: env.MAIL_FROM_NAME || "RelayNest",
  mailer_subjects_confirmation: "Confirm your email address",
  mailer_templates_confirmation_content: tpl("confirmation"),
  mailer_subjects_invite: "You've been invited to RelayNest",
  mailer_templates_invite_content: tpl("invite"),
  mailer_subjects_magic_link: "Your RelayNest sign-in link",
  mailer_templates_magic_link_content: tpl("magic_link"),
  mailer_subjects_email_change: "Confirm your new email address",
  mailer_templates_email_change_content: tpl("email_change"),
  mailer_subjects_recovery: "Reset your RelayNest password",
  mailer_templates_recovery_content: tpl("recovery"),
  mailer_subjects_reauthentication: "{{ .Token }} is your RelayNest verification code",
  mailer_templates_reauthentication_content: tpl("reauthentication"),
  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: "Your RelayNest password was changed",
  mailer_templates_password_changed_notification_content: tpl("password_changed"),
  mailer_notifications_email_changed_enabled: true,
  mailer_subjects_email_changed_notification: "Your RelayNest email address was changed",
  mailer_templates_email_changed_notification_content: tpl("email_changed"),
};
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  body.external_google_enabled = true;
  body.external_google_client_id = env.GOOGLE_CLIENT_ID;
  body.external_google_secret = env.GOOGLE_CLIENT_SECRET;
}

const secret = new Set(["smtp_pass", "external_google_secret"]);
console.log(`Project ${ref} (${apply ? "APPLY" : "dry run"})`);
for (const [k, v] of Object.entries(body)) {
  const shown = secret.has(k) ? "********" : typeof v === "string" && v.length > 80 ? `<${v.length} chars>` : v;
  console.log(`  ${k}: ${shown}`);
}
if (!apply) {
  console.log("\nNothing sent. Re-run with --apply to update the project.");
  process.exit(0);
}
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log("Auth configuration updated.");
