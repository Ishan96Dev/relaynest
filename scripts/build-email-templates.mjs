// Generates all Supabase Auth & account lifecycle HTML email templates in supabase/templates/*.html
// using one synced Aurora dark theme optimized for Outlook (Windows VML/MSO & Outlook Web), Gmail, Apple Mail, and Yahoo Mail.
// Run: pnpm emails  (or: EMAIL_ASSET_URL=https://app.yourdomain.com node scripts/build-email-templates.mjs)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "supabase", "templates");
const DEFAULT_PUBLIC_LOGO =
  "https://crqrisksouijdrvlnekp.supabase.co/storage/v1/object/public/brand/logo-icon-128.png";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
const customAssetBase = process.env.EMAIL_ASSET_URL?.trim().replace(/\/$/, "");
const LOGO =
  process.env.EMAIL_LOGO_URL?.trim() ||
  (customAssetBase
    ? `${customAssetBase}/brand/logo-icon-128.png`
    : supabaseUrl && /^https:\/\//i.test(supabaseUrl)
      ? `${supabaseUrl}/storage/v1/object/public/brand/logo-icon-128.png`
      : DEFAULT_PUBLIC_LOGO);
const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MSO_FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
const SUPPORT = "ishanrock1234@gmail.com";
const GITHUB = "https://github.com/Ishan96Dev/relaynest";

const badgeChip = (label) => `                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0 0 14px;">
                      <tr>
                        <td bgcolor="#1F1B4D" style="padding:5px 12px;border-radius:999px;background-color:#1F1B4D;border:1px solid #4B3FA8;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#C4B5FD;line-height:16px;mso-line-height-rule:exactly;">
                          ${label}
                        </td>
                      </tr>
                    </table>`;

const p = (text) =>
  `                    <p class="rn-text" style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#D2CFF0;">${text}</p>`;

const detailsTable = (title, rows) => {
  const trs = rows
    .map(
      ([label, val], idx) => `                        <tr>
                          <td class="rn-kv-key" valign="top" width="144" style="width:144px;padding:10px 12px 10px 0;${idx > 0 ? "border-top:1px solid #1E1A4A;" : ""}font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;line-height:18px;mso-line-height-rule:exactly;color:#9E9AC4;">${label}</td>
                          <td class="rn-kv-val" valign="top" style="padding:10px 0;${idx > 0 ? "border-top:1px solid #1E1A4A;" : ""}font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;mso-line-height-rule:exactly;color:#F8F8FF;word-break:break-word;">${val}</td>
                        </tr>`,
    )
    .join("\n");
  return `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:18px 0 6px;">
                <tr>
                  <td bgcolor="#0B0A22" style="padding:16px 20px;background-color:#0B0A22;border:1px solid #29245E;border-radius:14px;">
                    <div style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:0.7px;text-transform:uppercase;line-height:16px;mso-line-height-rule:exactly;color:#A78BFA;">${title}</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
${trs}
                    </table>
                  </td>
                </tr>
              </table>`;
};

const button = (label, href) => `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:26px 0 20px;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:290px;" arcsize="25%" stroke="f" fillcolor="#6C47FF">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:${MSO_FONT};font-size:15px;font-weight:bold;">${label}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0 auto;">
                      <tr>
                        <td class="rn-btn-cell" align="center" bgcolor="#6C47FF" style="border-radius:12px;background-color:#6C47FF;background-image:linear-gradient(135deg,#7C5CFF 0%,#5B34F0 55%,#06B6D4 100%);">
                          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;font-weight:700;line-height:20px;mso-line-height-rule:exactly;color:#ffffff;background-color:#6C47FF;background-image:linear-gradient(135deg,#7C5CFF 0%,#5B34F0 55%,#06B6D4 100%);border:1px solid #7C5CFF;text-decoration:none;border-radius:12px;">${label}</a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>`;

const fallbackLink = (href) => `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:18px 0 0;">
                <tr>
                  <td class="rn-fallback" bgcolor="#0B0A22" style="padding:14px 16px;background-color:#0B0A22;border:1px solid #26225A;border-radius:10px;text-align:center;">
                    <p class="rn-muted" style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#9E9AC4;">Button not working? Copy and paste this secure link into your browser:</p>
                    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;mso-line-height-rule:exactly;word-break:break-all;overflow-wrap:anywhere;">
                      <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#22D3EE;text-decoration:underline;">${href}</a>
                    </p>
                  </td>
                </tr>
              </table>`;

const code = (value) => `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:22px 0 20px;">
                <tr>
                  <td align="center" class="rn-code" bgcolor="#0B0A22" style="padding:18px 20px;background-color:#0B0A22;border:1px solid #39347A;border-radius:14px;font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:28px;font-weight:800;letter-spacing:6px;line-height:36px;mso-line-height-rule:exactly;color:#F8F8FF;">
                    ${value}
                  </td>
                </tr>
              </table>`;

const notice = (text, accent = "#6C47FF") => `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:22px 0 0;">
                <tr>
                  <td class="rn-notice" bgcolor="#0D0C26" style="padding:14px 18px;background-color:#0D0C26;border:1px solid #29245E;border-left:4px solid ${accent};border-radius:10px;font-family:${FONT};font-size:13px;line-height:21px;mso-line-height-rule:exactly;color:#C9C6EC;">
                    ${text}
                  </td>
                </tr>
              </table>`;

const legalLinks = [
  ["Privacy Policy", "{{ .SiteURL }}/privacy"],
  ["Terms of Use", "{{ .SiteURL }}/terms-of-use"],
  ["Website Policy", "{{ .SiteURL }}/website-policy"],
  ["Feedback", "{{ .SiteURL }}/feedback"],
  ["Contact Us", "{{ .SiteURL }}/contact"],
  ["Disclaimer", "{{ .SiteURL }}/disclaimer"],
  ["Responsible AI", "{{ .SiteURL }}/responsible-ai"],
]
  .map(
    ([l, h]) =>
      `<a href="${h}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:2px 6px;color:#A78BFA;text-decoration:none;white-space:nowrap;">${l}</a>`,
  )
  .join(" &middot; ");

function layout({ preheader, badge, title, body }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style type="text/css">
    html, body { margin:0 !important; padding:0 !important; width:100% !important; background-color:#08081A; color:#F8F8FF; }
    table, td { border-collapse:collapse !important; mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a[x-apple-data-detectors], #MessageViewBody a, u + .rn-body a { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
    [data-ogsc] .rn-card { background-color:#131130 !important; }
    [data-ogsc] .rn-text { color:#D2CFF0 !important; }
    @media only screen and (max-width:620px) {
      .rn-wrap { width:100% !important; max-width:100% !important; }
      .rn-outer { padding:24px 12px 28px !important; }
      .rn-inner { padding:26px 20px 28px !important; }
      .rn-kv-key, .rn-kv-val { display:block !important; width:100% !important; padding-left:0 !important; padding-right:0 !important; }
      .rn-kv-key { padding-bottom:2px !important; }
      .rn-kv-val { padding-top:0 !important; }
      .rn-btn-cell, .rn-btn-cell a { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
    }
  </style>
</head>
<body class="rn-body rn-bg" bgcolor="#08081A" style="margin:0;padding:0;background-color:#08081A;font-family:${FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" class="rn-bg" width="100%" bgcolor="#08081A" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;background-color:#08081A;">
    <tr>
      <td class="rn-outer" align="center" bgcolor="#08081A" style="padding:40px 16px 44px;background-color:#08081A;">
        <!--[if (gte mso 9)|(IE)]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="580" style="width:580px;">
          <tr>
            <td align="center" valign="top" width="580">
        <![endif]-->
        <table role="presentation" class="rn-wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:100%;max-width:580px;margin:0 auto;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <a href="{{ .SiteURL }}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <td valign="middle" style="padding-right:14px;vertical-align:middle;">
                      <img src="${LOGO}" width="48" height="48" border="0" alt="RelayNest logo" style="display:block;width:48px;height:48px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;border-radius:12px;background-color:#131130;color:#A78BFA;font-family:${FONT};font-size:12px;font-weight:800;text-align:center;line-height:48px;">
                    </td>
                    <td valign="middle" style="vertical-align:middle;text-align:left;">
                      <div style="font-family:${FONT};font-size:24px;font-weight:800;line-height:26px;mso-line-height-rule:exactly;letter-spacing:-0.4px;color:#F8F8FF;">RelayNest</div>
                      <div style="font-family:${FONT};font-size:11px;font-weight:600;line-height:15px;mso-line-height-rule:exactly;letter-spacing:0.4px;text-transform:uppercase;color:#A78BFA;">Telegram Bot &amp; AI Platform</div>
                    </td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
          <tr>
            <td class="rn-card" bgcolor="#131130" style="background-color:#131130;border:1px solid #2D2868;border-radius:20px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td bgcolor="#6C47FF" height="5" style="height:5px;line-height:5px;mso-line-height-rule:exactly;font-size:1px;background-color:#6C47FF;background-image:linear-gradient(90deg,#6C47FF,#3B82F6,#22D3EE);">&nbsp;</td>
                </tr>
                <tr>
                  <td class="rn-inner" bgcolor="#131130" style="padding:36px 38px 38px;background-color:#131130;font-family:${FONT};">
${badgeChip(badge)}
                    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:32px;mso-line-height-rule:exactly;font-weight:800;letter-spacing:-0.4px;color:#F8F8FF;">${title}</h1>
${body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 12px 0;font-family:${FONT};">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:20px;mso-line-height-rule:exactly;color:#C9C6EC;">
                <strong style="color:#F8F8FF;">Help &amp; Support:</strong>
                <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>
                &nbsp;&middot;&nbsp;
                <strong style="color:#F8F8FF;">Get Social:</strong>
                <a href="${GITHUB}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;font-weight:700;text-decoration:none;">GitHub</a>
              </p>
              <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;line-height:22px;mso-line-height-rule:exactly;color:#9E9AC4;">
                ${legalLinks}
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#7B77A6;">
                Sent by <a href="{{ .SiteURL }}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;text-decoration:none;font-weight:700;">RelayNest</a> &middot; No-Code Telegram Bot &amp; Automation Platform &middot; Automated security message.
              </p>
            </td>
          </tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
            </td>
          </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const resetPasswordTemplate = layout({
  preheader: "Reset your RelayNest account password securely.",
  badge: "Reset Password",
  title: "Reset your password",
  body: [
    p('We received a request to reset the password for your RelayNest account (<strong style="color:#F8F8FF;">{{ .Email }}</strong>). Use the secure button below to choose a new strong password.'),
    detailsTable("Recovery Request", [
      ["Account", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
      ["Link Policy", "Single-use recovery token (expires shortly)"],
      ["Current Password", "Remains unchanged until you submit a new password"],
    ]),
    button("Reset password", "{{ .ConfirmationURL }}"),
    fallbackLink("{{ .ConfirmationURL }}"),
    notice("If you did not request a password reset, you can safely ignore this email. Your existing password and active workspace bots remain untouched."),
  ].join("\n"),
});

const templates = {
  confirmation: layout({
    preheader: "Confirm your email address to activate your RelayNest workspace.",
    badge: "Account Verification",
    title: "Confirm your email address",
    body: [
      p('Welcome to RelayNest! Confirm that <strong style="color:#F8F8FF;">{{ .Email }}</strong> belongs to you so we can provision your workspace and unlock no-code Telegram bots, AI agents, and visual automations.'),
      detailsTable("Account Summary", [
        ["Email Address", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Workspace Access", "Telegram Bots, AI Agents, Knowledge Base &amp; Workflows"],
        ["Verification", "One-click activation link (single-use)"],
      ]),
      button("Confirm email address", "{{ .ConfirmationURL }}"),
      fallbackLink("{{ .ConfirmationURL }}"),
      notice(`If you did not create a RelayNest account, you can safely ignore this email or contact us at <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>.`),
    ].join("\n"),
  }),
  invite: layout({
    preheader: "You have been invited to collaborate inside a RelayNest workspace.",
    badge: "Workspace Invitation",
    title: "You've been invited to RelayNest",
    body: [
      p("A teammate invited you to join their workspace on RelayNest—the no-code Telegram bot builder, AI agent studio, and workflow automation platform."),
      p("Accept the invitation below to set your account password and start collaborating on shared bots, knowledge collections, and automations."),
      detailsTable("Invitation Details", [
        ["Invited Email", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Capabilities", "Shared Telegram bots, AI agents, workflows &amp; execution logs"],
        ["Onboarding", "Set password &amp; join workspace immediately"],
      ]),
      button("Accept invitation", "{{ .ConfirmationURL }}"),
      fallbackLink("{{ .ConfirmationURL }}"),
      notice(`Not expecting this invitation? Ignore this email or contact <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>.`),
    ].join("\n"),
  }),
  magic_link: layout({
    preheader: "Your RelayNest sign-in link and one-time verification code.",
    badge: "Magic Sign-In",
    title: "Sign in to RelayNest",
    body: [
      p('Use the secure button below to sign directly in to RelayNest as <strong style="color:#F8F8FF;">{{ .Email }}</strong>. For your protection, this link can only be used once and expires shortly.'),
      detailsTable("Sign-In Request", [
        ["Account", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Method", "Passwordless Magic Link / One-Time Code"],
        ["Validity", "Single-use session link"],
      ]),
      button("Sign in to RelayNest", "{{ .ConfirmationURL }}"),
      p("Prefer entering a verification code? Type this one-time passcode on the sign-in screen:"),
      code("{{ .Token }}"),
      fallbackLink("{{ .ConfirmationURL }}"),
      notice("If you did not request this sign-in link, do not forward this email—you can safely ignore it.", "#F59E0B"),
    ].join("\n"),
  }),
  email_change: layout({
    preheader: "Confirm the new email address for your RelayNest account.",
    badge: "Email Update",
    title: "Confirm your new email address",
    body: [
      p('We received a request to update the login email address on your RelayNest account from <strong style="color:#F8F8FF;">{{ .Email }}</strong> to <strong style="color:#22D3EE;">{{ .NewEmail }}</strong>.'),
      detailsTable("Email Change Request", [
        ["Current Email", "{{ .Email }}"],
        ["New Email", '<span style="color:#22D3EE;">{{ .NewEmail }}</span>'],
        ["Status", "Pending your confirmation"],
      ]),
      button("Confirm new email address", "{{ .ConfirmationURL }}"),
      fallbackLink("{{ .ConfirmationURL }}"),
      notice(`If you did not request this change, do not click the button and contact <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a> immediately.`, "#EF4444"),
    ].join("\n"),
  }),
  recovery: resetPasswordTemplate,
  reset_password: resetPasswordTemplate,
  reauthentication: layout({
    preheader: "{{ .Token }} is your RelayNest security verification code.",
    badge: "Re-Authentication",
    title: "Confirm it's you",
    body: [
      p("Enter the 6-digit security verification code below to confirm a sensitive account action in RelayNest (such as deleting an account, rotating credentials, or updating security settings)."),
      detailsTable("Security Check", [
        ["Account", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Verification Type", "Sensitive Action Step-Up Code"],
        ["Expiry", "Expires in a few minutes · Never share this code"],
      ]),
      code("{{ .Token }}"),
      notice(`Did not initiate this check? Do not share this code and contact <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a> right away.`, "#EF4444"),
    ].join("\n"),
  }),
  password_changed: layout({
    preheader: "The password on your RelayNest account was changed.",
    badge: "Security Notification",
    title: "Your password was changed",
    body: [
      p('This is an automated security confirmation that the login password for <strong style="color:#F8F8FF;">{{ .Email }}</strong> was just updated.'),
      detailsTable("Security Event", [
        ["Account", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Action", "Account Password Updated"],
        ["Workspace Impact", "Bots, encrypted tokens &amp; automations remain active"],
      ]),
      notice(`If you did not make this change, reset your password immediately and contact <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>.`, "#EF4444"),
      button("Reset password", "{{ .SiteURL }}/forgot-password"),
    ].join("\n"),
  }),
  email_changed: layout({
    preheader: "The email address on your RelayNest account was changed.",
    badge: "Security Notification",
    title: "Your email address was changed",
    body: [
      p('The primary login email address on your RelayNest account has been updated from <strong style="color:#F8F8FF;">{{ .OldEmail }}</strong> to <strong style="color:#22D3EE;">{{ .Email }}</strong>. Future sign-ins and security alerts will use the new address.'),
      detailsTable("Updated Login Details", [
        ["Previous Email", "{{ .OldEmail }}"],
        ["Active Email", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Status", "Confirmed &amp; Active"],
      ]),
      notice(`If you did not authorize this change, contact Help &amp; Support immediately at <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>.`, "#EF4444"),
    ].join("\n"),
  }),
  account_deleted: layout({
    preheader: "Confirmation that your RelayNest account and workspaces have been permanently deleted.",
    badge: "Account Deletion",
    title: "Your RelayNest account has been deleted",
    body: [
      p('This confirms that your RelayNest account for <strong style="color:#F8F8FF;">{{ .Email }}</strong> has been permanently deleted.'),
      p("All owned workspaces, Telegram bot connections, encrypted tokens, API keys, automation workflows, knowledge base collections, and uploaded files have been permanently removed from our servers."),
      detailsTable("Deletion Summary", [
        ["Deleted Account", '<span style="color:#22D3EE;">{{ .Email }}</span>'],
        ["Status", '<span style="color:#F87171;font-weight:700;">Permanently Erased</span>'],
        ["Purged Scope", "Workspaces, bots, webhooks, encrypted keys &amp; storage"],
      ]),
      notice(`If you did not authorize this deletion, contact Help &amp; Support immediately at <a href="mailto:${SUPPORT}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT}</a>.`, "#EF4444"),
      button("Create New Account", "{{ .SiteURL }}/signup"),
    ].join("\n"),
  }),
};

mkdirSync(outDir, { recursive: true });
for (const [name, html] of Object.entries(templates)) {
  writeFileSync(path.join(outDir, `${name}.html`), html);
}
console.log(`Wrote ${Object.keys(templates).length} branded Aurora templates to ${path.relative(process.cwd(), outDir)}`);
