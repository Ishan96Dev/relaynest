import "server-only";

/** Where people can reach Help & Support. Shown in every transactional email footer. */
export const SUPPORT_EMAIL = "ishanrock1234@gmail.com";
export const GITHUB_URL = "https://github.com/Ishan96Dev/relaynest";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MSO_FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

export function emailFooterHtml(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, "");
  const legal = [
    ["Privacy Policy", `${b}/privacy`],
    ["Terms of Use", `${b}/terms-of-use`],
    ["Website Policy", `${b}/website-policy`],
    ["Feedback", `${b}/feedback`],
    ["Contact Us", `${b}/contact`],
    ["Disclaimer", `${b}/disclaimer`],
    ["Responsible AI", `${b}/responsible-ai`],
  ] as const;
  const links = legal
    .map(
      ([l, h]) =>
        `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:2px 6px;color:#A78BFA;text-decoration:none;white-space:nowrap;">${l}</a>`,
    )
    .join(" &middot; ");
  return `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:20px;mso-line-height-rule:exactly;color:#C9C6EC;">
    <strong style="color:#F8F8FF;">Help &amp; Support:</strong>
    <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>
    &nbsp;&middot;&nbsp;
    <strong style="color:#F8F8FF;">Get Social:</strong>
    <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;font-weight:700;text-decoration:none;">GitHub</a>
  </p>
  <p style="margin:0 0 10px;font-family:${FONT};font-size:11px;line-height:22px;mso-line-height-rule:exactly;color:#9E9AC4;">${links}</p>
  <p style="margin:0;font-family:${FONT};font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#7B77A6;">
    Sent by <a href="${esc(b)}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;text-decoration:none;font-weight:700;">RelayNest</a> &middot; No-Code Telegram Bot &amp; Automation Platform &middot; Automated message.
  </p>`;
}

/**
 * Branded Aurora dark layout synced with the RelayNest UI and cross-client safe for
 * Outlook (Windows VML/MSO), Gmail (Web/Mobile), Apple Mail, and Yahoo Mail.
 */
function layout(title: string, body: string, appUrl: string, preheader = "") {
  const base = appUrl.replace(/\/$/, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const logo =
    process.env.EMAIL_LOGO_URL?.trim() ||
    (supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/brand/logo-icon-128.png`
      : `${base}/brand/logo-icon-128.png`);
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
<title>${esc(title)}</title>
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
    .rn-btn-cell, .rn-btn-cell a { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
  }
</style>
</head>
<body class="rn-body rn-bg" bgcolor="#08081A" style="margin:0;padding:0;background-color:#08081A;font-family:${FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader || title)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" class="rn-bg" width="100%" bgcolor="#08081A" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;background-color:#08081A;">
<tr><td class="rn-outer" align="center" bgcolor="#08081A" style="padding:40px 16px 44px;background-color:#08081A;">
  <!--[if (gte mso 9)|(IE)]>
  <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="580" style="width:580px;">
    <tr>
      <td align="center" valign="top" width="580">
  <![endif]-->
  <table role="presentation" class="rn-wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:100%;max-width:580px;margin:0 auto;">
    <tr><td align="center" style="padding:0 0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr>
        <td valign="middle" style="padding-right:12px;vertical-align:middle;"><img src="${esc(logo)}" width="44" height="44" border="0" alt="RelayNest logo" style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;border-radius:12px;"></td>
        <td valign="middle" style="vertical-align:middle;text-align:left;">
          <div style="font-family:${FONT};font-size:24px;font-weight:800;line-height:26px;mso-line-height-rule:exactly;letter-spacing:-0.4px;color:#F8F8FF;">RelayNest</div>
          <div style="font-family:${FONT};font-size:11px;font-weight:600;line-height:15px;mso-line-height-rule:exactly;letter-spacing:0.4px;text-transform:uppercase;color:#A78BFA;">Telegram Bot &amp; AI Platform</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td class="rn-card" bgcolor="#131130" style="background-color:#131130;border:1px solid #2D2868;border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr><td bgcolor="#6C47FF" height="5" style="height:5px;line-height:5px;mso-line-height-rule:exactly;font-size:1px;background-color:#6C47FF;background-image:linear-gradient(90deg,#6C47FF,#3B82F6,#22D3EE);">&nbsp;</td></tr>
        <tr><td class="rn-inner" bgcolor="#131130" style="padding:36px 38px 38px;background-color:#131130;font-family:${FONT};">
          <h1 class="rn-title" style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:32px;mso-line-height-rule:exactly;font-weight:800;letter-spacing:-0.4px;color:#F8F8FF;">${esc(title)}</h1>
          ${body}
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:26px 12px 0;font-family:${FONT};">
      ${emailFooterHtml(base)}
    </td></tr>
  </table>
  <!--[if (gte mso 9)|(IE)]>
      </td>
    </tr>
  </table>
  <![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

const p = (t: string) =>
  `<p class="rn-text" style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#D2CFF0;">${t}</p>`;
const button = (label: string, href: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:26px 0 6px;"><tr><td align="center">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="25%" stroke="f" fillcolor="#6C47FF">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:${MSO_FONT};font-size:15px;font-weight:bold;">${esc(label)}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0 auto;"><tr>
    <td class="rn-btn-cell" align="center" bgcolor="#6C47FF" style="border-radius:12px;background-color:#6C47FF;background-image:linear-gradient(135deg,#7C5CFF 0%,#5B34F0 55%,#06B6D4 100%);">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;font-weight:700;line-height:20px;mso-line-height-rule:exactly;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(label)}</a>
    </td>
  </tr></table>
  <!--<![endif]-->
</td></tr></table>`;
const note = (t: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:22px 0 0;"><tr>
  <td class="rn-note rn-text" bgcolor="#0D0C26" style="padding:14px 18px;background-color:#0D0C26;border:1px solid #29245E;border-left:4px solid #6C47FF;border-radius:10px;font-family:${FONT};font-size:13px;line-height:21px;mso-line-height-rule:exactly;color:#C9C6EC;">${t}</td>
</tr></table>`;

export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(minor / 100);

export function paymentReceiptEmail(a: { plan: string; amount: number; currency: string; invoiceNumber: string; periodEnd?: string | null; appUrl: string }) {
  const until = a.periodEnd ? ` Your plan is active until ${new Date(a.periodEnd).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}.` : "";
  return {
    subject: `Payment received for RelayNest ${a.plan} (${a.invoiceNumber})`,
    html: layout("Payment received",
      p(`Thanks! We received <strong>${esc(money(a.amount, a.currency))}</strong> for the <strong>${esc(a.plan)}</strong> plan.${esc(until)}`) +
      p(`Invoice <strong>${esc(a.invoiceNumber)}</strong> is available under Settings &rarr; Billing.`) +
      button("View billing", `${a.appUrl}/settings/billing`) +
      note(`Questions about this charge? Contact Help &amp; Support at <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`), a.appUrl, `We received your payment for ${a.plan}.`),
  };
}
export function paymentFailedEmail(a: { plan: string; appUrl: string }) {
  return {
    subject: "Your RelayNest payment did not go through",
    html: layout("Payment failed",
      p(`We could not collect payment for the <strong>${esc(a.plan)}</strong> plan. Please update your payment method to keep your plan.`) +
      button("Open billing", `${a.appUrl}/settings/billing`) +
      note("If you already updated your payment method, you can ignore this email."), a.appUrl, "Action needed: update your payment method."),
  };
}
export function subscriptionEndedEmail(a: { plan: string; appUrl: string }) {
  return {
    subject: "Your RelayNest subscription has ended",
    html: layout("Subscription ended",
      p(`Your <strong>${esc(a.plan)}</strong> plan has ended and your workspace is back on the Free plan. Your data is kept. You can upgrade again at any time.`) +
      button("Choose a plan", `${a.appUrl}/settings/billing`), a.appUrl, "Your plan ended. Your data is safe."),
  };
}
export function automationFailedEmail(a: { name: string; error: string; appUrl: string }) {
  return {
    subject: `Automation failed: ${a.name}`,
    html: layout("Automation failed",
      p(`The automation <strong>${esc(a.name)}</strong> failed.`) +
      note(`<strong>Reason:</strong> ${esc(a.error)}`) +
      button("View executions", `${a.appUrl}/executions`), a.appUrl, `${a.name} failed to run.`),
  };
}

export function accountDeletedEmail(a: { email: string; name?: string; deletedAt: string; workspaceCount?: number; appUrl: string }) {
  const who = a.name?.trim() ? `${esc(a.name)} (<strong>${esc(a.email)}</strong>)` : `<strong>${esc(a.email)}</strong>`;
  const wsLine = typeof a.workspaceCount === "number" && a.workspaceCount > 0
    ? ` and ${a.workspaceCount} owned workspace${a.workspaceCount === 1 ? "" : "s"}`
    : "";
  const when = new Date(a.deletedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  return {
    subject: "Your RelayNest account has been deleted",
    html: layout(
      "Your RelayNest account has been deleted",
      p(`This confirms that the RelayNest account for ${who}${wsLine} was permanently deleted on <strong style="color:#F8F8FF;">${esc(when)}</strong>.`) +
      p("All associated Telegram bot connections, encrypted tokens, API keys, automation workflows, and uploaded workspace assets have been erased.") +
      note(`If you did not request account deletion, contact Help &amp; Support immediately at <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`) +
      button("Create New Account", `${a.appUrl.replace(/\/$/, "")}/signup`),
      a.appUrl,
      `Account deletion confirmed for ${a.email}.`,
    ),
  };
}
