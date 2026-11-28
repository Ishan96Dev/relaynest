import "server-only";

/** Where people can reach Help & Support. Shown in every transactional email footer. */
export const SUPPORT_EMAIL = "ishanrock1234@gmail.com";
export const GITHUB_URL = "https://github.com/Ishan96Dev/relaynest";
export const DEFAULT_EMAIL_LOGO_URL =
  "https://crqrisksouijdrvlnekp.supabase.co/storage/v1/object/public/brand/logo-icon-128.png";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MSO_FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
const MONO_FONT = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

/**
 * Resolves a publicly reachable HTTPS PNG URL for the RelayNest brand mark so Gmail,
 * Outlook (Desktop & Web), Apple Mail, and Yahoo Mail always render the logo—even when
 * triggered from a local `http://localhost:3000` dev server.
 */
export function resolveEmailLogoUrl(appUrl: string): string {
  const explicit = process.env.EMAIL_LOGO_URL?.trim();
  if (explicit) return explicit;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
  if (supabaseUrl && /^https:\/\//i.test(supabaseUrl)) {
    return `${supabaseUrl}/storage/v1/object/public/brand/logo-icon-128.png`;
  }

  const base = appUrl.trim().replace(/\/$/, "");
  if (/^https:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base)) {
    return `${base}/brand/logo-icon-128.png`;
  }

  return DEFAULT_EMAIL_LOGO_URL;
}

export function formatEmailTimestamp(date: Date = new Date(), timeZone?: string): string {
  const utc =
    date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC";

  if (!timeZone || timeZone === "UTC") return utc;
  try {
    const local = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone,
    }).format(date);
    return `${local} (${utc})`;
  } catch {
    return utc;
  }
}

export function parseUserAgentSummary(ua?: string | null): string | null {
  if (!ua || !ua.trim()) return null;
  const s = ua.trim();

  let browser = "";
  if (/Edg\//i.test(s)) browser = "Microsoft Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/Brave/i.test(s)) browser = "Brave";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = "Google Chrome";
  else if (/Chromium\//i.test(s)) browser = "Chromium";
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = "Safari";
  else if (/curl\//i.test(s)) browser = "cURL CLI";

  let os = "";
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Linux/i.test(s)) os = "Linux";

  if (browser && os) return `${browser} on ${os}`;
  if (browser || os) return browser || os;
  return s.length > 64 ? `${s.slice(0, 61)}...` : s;
}

export function formatClientIp(ip?: string | null): string | null {
  if (!ip || !ip.trim()) return null;
  const clean = ip.trim();
  if (clean === "::1" || clean === "127.0.0.1" || clean === "::ffff:127.0.0.1" || clean === "localhost") {
    return "127.0.0.1 (Local session)";
  }
  return clean.slice(0, 64);
}

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

interface LayoutOptions {
  badge?: string;
  footerStripHtml?: string;
}

const badgeChip = (label: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0 0 14px;">
  <tr>
    <td bgcolor="#1F1B4D" style="padding:5px 12px;border-radius:999px;background-color:#1F1B4D;border:1px solid #4B3FA8;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#C4B5FD;line-height:16px;mso-line-height-rule:exactly;">
      ${esc(label)}
    </td>
  </tr>
</table>`;

/**
 * Branded Aurora dark layout synced with the RelayNest UI and cross-client safe for
 * Outlook (Windows VML/MSO & Outlook Web), Gmail (Web/Mobile), Apple Mail, and Yahoo Mail.
 */
function layout(title: string, body: string, appUrl: string, preheader = "", opts?: LayoutOptions) {
  const base = appUrl.replace(/\/$/, "");
  const logo = resolveEmailLogoUrl(base);
  const strip = opts?.footerStripHtml
    ? `<tr><td bgcolor="#0E0C27" style="padding:16px 38px;background-color:#0E0C27;border-top:1px solid #26225A;font-family:${FONT};font-size:12px;line-height:19px;mso-line-height-rule:exactly;color:#9E9AC4;">${opts.footerStripHtml}</td></tr>`
    : "";

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
    .rn-strip { padding:14px 20px !important; }
    .rn-kv-key, .rn-kv-val { display:block !important; width:100% !important; padding-left:0 !important; padding-right:0 !important; }
    .rn-kv-key { padding-bottom:2px !important; }
    .rn-kv-val { padding-top:0 !important; }
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
      <a href="${esc(base)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr>
          <td valign="middle" style="padding-right:14px;vertical-align:middle;">
            <img src="${esc(logo)}" width="48" height="48" border="0" alt="RelayNest logo" style="display:block;width:48px;height:48px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;border-radius:12px;background-color:#131130;color:#A78BFA;font-family:${FONT};font-size:12px;font-weight:800;text-align:center;line-height:48px;">
          </td>
          <td valign="middle" style="vertical-align:middle;text-align:left;">
            <div style="font-family:${FONT};font-size:24px;font-weight:800;line-height:26px;mso-line-height-rule:exactly;letter-spacing:-0.4px;color:#F8F8FF;">RelayNest</div>
            <div style="font-family:${FONT};font-size:11px;font-weight:600;line-height:15px;mso-line-height-rule:exactly;letter-spacing:0.4px;text-transform:uppercase;color:#A78BFA;">Telegram Bot &amp; AI Platform</div>
          </td>
        </tr></table>
      </a>
    </td></tr>
    <tr><td class="rn-card" bgcolor="#131130" style="background-color:#131130;border:1px solid #2D2868;border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr><td bgcolor="#6C47FF" height="5" style="height:5px;line-height:5px;mso-line-height-rule:exactly;font-size:1px;background-color:#6C47FF;background-image:linear-gradient(90deg,#6C47FF,#3B82F6,#22D3EE);">&nbsp;</td></tr>
        <tr><td class="rn-inner" bgcolor="#131130" style="padding:36px 38px 34px;background-color:#131130;font-family:${FONT};">
          ${opts?.badge ? badgeChip(opts.badge) : ""}
          <h1 class="rn-title" style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:32px;mso-line-height-rule:exactly;font-weight:800;letter-spacing:-0.4px;color:#F8F8FF;">${esc(title)}</h1>
          ${body}
        </td></tr>
        ${strip}
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

const detailsTable = (title: string, rows: ReadonlyArray<readonly [label: string, valueHtml: string]>) => {
  if (!rows.length) return "";
  const bodyRows = rows
    .map(
      ([label, val], idx) => `
      <tr>
        <td class="rn-kv-key" valign="top" width="148" style="width:148px;padding:10px 12px 10px 0;${idx > 0 ? "border-top:1px solid #1E1A4A;" : ""}font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;line-height:18px;mso-line-height-rule:exactly;color:#9E9AC4;">${esc(label)}</td>
        <td class="rn-kv-val" valign="top" style="padding:10px 0;${idx > 0 ? "border-top:1px solid #1E1A4A;" : ""}font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;mso-line-height-rule:exactly;color:#F8F8FF;word-break:break-word;">${val}</td>
      </tr>`,
    )
    .join("");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:18px 0 6px;">
  <tr>
    <td bgcolor="#0B0A22" style="padding:16px 20px;background-color:#0B0A22;border:1px solid #29245E;border-radius:14px;">
      <div style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:0.7px;text-transform:uppercase;line-height:16px;mso-line-height-rule:exactly;color:#A78BFA;">${esc(title)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        ${bodyRows}
      </table>
    </td>
  </tr>
</table>`;
};

const button = (label: string, href: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:26px 0 18px;"><tr><td align="center">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:48px;v-text-anchor:middle;width:290px;" arcsize="25%" stroke="f" fillcolor="#6C47FF">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:${MSO_FONT};font-size:15px;font-weight:bold;">${esc(label)}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:0 auto;"><tr>
    <td class="rn-btn-cell" align="center" bgcolor="#6C47FF" style="border-radius:12px;background-color:#6C47FF;background-image:linear-gradient(135deg,#7C5CFF 0%,#5B34F0 55%,#06B6D4 100%);">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;font-weight:700;line-height:20px;mso-line-height-rule:exactly;color:#ffffff;background-color:#6C47FF;background-image:linear-gradient(135deg,#7C5CFF 0%,#5B34F0 55%,#06B6D4 100%);border:1px solid #7C5CFF;text-decoration:none;border-radius:12px;">${esc(label)}</a>
    </td>
  </tr></table>
  <!--<![endif]-->
</td></tr></table>`;

const fallbackLink = (href: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:14px 0 0;"><tr>
  <td bgcolor="#0B0A22" style="padding:12px 16px;background-color:#0B0A22;border:1px solid #26225A;border-radius:10px;text-align:center;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#9E9AC4;">Button not working? Copy and paste this secure link into your browser:</p>
    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;mso-line-height-rule:exactly;word-break:break-all;overflow-wrap:anywhere;">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="color:#22D3EE;text-decoration:underline;">${esc(href)}</a>
    </p>
  </td>
</tr></table>`;

const note = (t: string, tone: "info" | "warning" | "danger" = "info") => {
  const accent = tone === "danger" ? "#EF4444" : tone === "warning" ? "#F59E0B" : "#6C47FF";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;margin:20px 0 0;"><tr>
  <td class="rn-note rn-text" bgcolor="#0D0C26" style="padding:14px 18px;background-color:#0D0C26;border:1px solid #29245E;border-left:4px solid ${accent};border-radius:10px;font-family:${FONT};font-size:13px;line-height:21px;mso-line-height-rule:exactly;color:#C9C6EC;">${t}</td>
</tr></table>`;
};

const mono = (v: string) =>
  `<span style="font-family:${MONO_FONT};font-size:13px;color:#E2E8F0;background-color:#151238;padding:2px 7px;border-radius:6px;border:1px solid #2D2868;">${esc(v)}</span>`;

export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(minor / 100);

export function paymentReceiptEmail(a: {
  plan: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  periodEnd?: string | null;
  appUrl: string;
}) {
  const base = a.appUrl.replace(/\/$/, "");
  const billingHref = `${base}/settings/billing`;
  const amountFormatted = money(a.amount, a.currency);
  const periodFormatted = a.periodEnd
    ? new Date(a.periodEnd).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })
    : null;
  const until = periodFormatted ? ` Your plan is active until ${periodFormatted}.` : "";
  const rows: Array<readonly [string, string]> = [
    ["Invoice Number", mono(a.invoiceNumber)],
    ["Plan Tier", `<strong style="color:#F8F8FF;">RelayNest ${esc(a.plan)}</strong>`],
    ["Amount Paid", `<strong style="color:#34D399;">${esc(amountFormatted)}</strong>`],
    ["Payment Status", `<span style="color:#34D399;font-weight:700;">Paid &amp; Confirmed</span>`],
    ...(periodFormatted ? ([["Active Until", esc(periodFormatted)]] as const) : []),
  ];

  return {
    subject: `Payment received for RelayNest ${a.plan} (${a.invoiceNumber})`,
    text: `Payment received for RelayNest ${a.plan}\nAmount: ${amountFormatted}\nInvoice: ${a.invoiceNumber}${until}\nManage billing: ${billingHref}`,
    html: layout(
      "Payment received",
      p(`Thank you for your payment! We received <strong style="color:#F8F8FF;">${esc(amountFormatted)}</strong> for your <strong style="color:#F8F8FF;">RelayNest ${esc(a.plan)}</strong> subscription.${esc(until)}`) +
        p(`Your workspace entitlements, monthly execution allowances, and AI agent limits are active immediately. Invoice <strong style="color:#F8F8FF;">${esc(a.invoiceNumber)}</strong> is available anytime under <strong>Settings &rarr; Billing</strong>.`) +
        detailsTable("Receipt Summary", rows) +
        button("View Billing & Invoice", billingHref) +
        fallbackLink(billingHref) +
        note(
          `Questions about this charge or need billing assistance? Reach Help &amp; Support at <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`,
        ),
      a.appUrl,
      `We received ${amountFormatted} for RelayNest ${a.plan} (Invoice ${a.invoiceNumber}).`,
      { badge: "Billing Receipt" },
    ),
  };
}

export function paymentFailedEmail(a: { plan: string; appUrl: string }) {
  const base = a.appUrl.replace(/\/$/, "");
  const billingHref = `${base}/settings/billing`;
  const rows: Array<readonly [string, string]> = [
    ["Affected Plan", `<strong style="color:#F8F8FF;">RelayNest ${esc(a.plan)}</strong>`],
    ["Charge Status", `<span style="color:#F87171;font-weight:700;">Payment Declined / Uncollected</span>`],
    ["Recommended Action", "Update your payment method or complete renewal in Billing"],
  ];

  return {
    subject: "Action required: Your RelayNest payment did not go through",
    text: `Payment failed for RelayNest ${a.plan}. Please update your payment method at ${billingHref} to avoid interruption to your bots and automations.`,
    html: layout(
      "Payment failed",
      p(`We could not collect the renewal payment for your <strong style="color:#F8F8FF;">RelayNest ${esc(a.plan)}</strong> plan.`) +
        p("To keep your higher bot quotas, AI agent workflows, and scheduled automations running without interruption, please review or update your payment method in Billing.") +
        detailsTable("Billing Alert Details", rows) +
        button("Update Payment Method", billingHref) +
        fallbackLink(billingHref) +
        note(
          `If you have already updated your payment details, you can disregard this message. Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`,
          "warning",
        ),
      a.appUrl,
      `Action needed: update your payment method for RelayNest ${a.plan}.`,
      { badge: "Billing Alert" },
    ),
  };
}

export function subscriptionEndedEmail(a: { plan: string; appUrl: string }) {
  const base = a.appUrl.replace(/\/$/, "");
  const billingHref = `${base}/settings/billing`;
  const rows: Array<readonly [string, string]> = [
    ["Previous Plan", esc(`RelayNest ${a.plan}`)],
    ["Current Plan", `<strong style="color:#22D3EE;">Free Plan</strong>`],
    ["Workspace Data", "Preserved (bots, AI agents, knowledge base &amp; logs retained)"],
  ];

  return {
    subject: "Your RelayNest subscription has ended",
    text: `Your RelayNest ${a.plan} subscription has ended and your workspace has moved to the Free plan. Your bots, workflows, and data remain safe. Upgrade anytime at ${billingHref}.`,
    html: layout(
      "Subscription ended",
      p(`Your <strong style="color:#F8F8FF;">RelayNest ${esc(a.plan)}</strong> billing period has ended, and your workspace has transitioned back to the <strong style="color:#F8F8FF;">Free</strong> plan.`) +
        p("None of your bots, AI agent configurations, knowledge base collections, or execution history were deleted. Free plan monthly execution and bot limits now apply until you upgrade again.") +
        detailsTable("Plan Transition Summary", rows) +
        button("Choose a Plan", billingHref) +
        fallbackLink(billingHref) +
        note(`Want to restore your ${esc(a.plan)} quotas right away? Pick monthly or annual billing anytime from your workspace Billing page.`),
      a.appUrl,
      `Your RelayNest ${a.plan} plan ended. Your workspace data is safe.`,
      { badge: "Subscription Update" },
    ),
  };
}

export function automationFailedEmail(a: { name: string; error: string; appUrl: string; occurredAt?: string }) {
  const base = a.appUrl.replace(/\/$/, "");
  const execHref = `${base}/executions`;
  const when = formatEmailTimestamp(a.occurredAt ? new Date(a.occurredAt) : new Date(), "UTC");
  const rows: Array<readonly [string, string]> = [
    ["Workflow", `<strong style="color:#F8F8FF;">${esc(a.name)}</strong>`],
    ["Run Status", `<span style="color:#F87171;font-weight:700;">Failed</span>`],
    ["Detected At", esc(when)],
  ];

  return {
    subject: `Automation failed: ${a.name}`,
    text: `Automation failed: ${a.name}\nDetected at: ${when}\nReason: ${a.error}\nInspect execution logs: ${execHref}`,
    html: layout(
      "Automation execution failed",
      p(`A scheduled or event-triggered run of <strong style="color:#F8F8FF;">${esc(a.name)}</strong> stopped with an error before completing all workflow steps.`) +
        detailsTable("Execution Summary", rows) +
        note(`<strong style="color:#FCA5A5;">Error diagnostic:</strong><br>${esc(a.error)}`, "danger") +
        p("Open the Executions view in RelayNest to inspect step-by-step inputs, outputs, webhook status codes, and retry the workflow once resolved.") +
        button("Inspect Execution Logs", execHref) +
        fallbackLink(execHref),
      a.appUrl,
      `${a.name} failed to complete: ${a.error.slice(0, 90)}`,
      {
        badge: "Execution Failure",
        footerStripHtml: `You are receiving critical workflow failure alerts. Adjust delivery rules anytime in <a href="${esc(`${base}/settings/notifications`)}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;font-weight:700;text-decoration:none;">Notification settings</a>.`,
      },
    ),
  };
}

export function accountDeletedEmail(a: {
  email: string;
  name?: string;
  deletedAt: string;
  workspaceCount?: number;
  appUrl: string;
}) {
  const base = a.appUrl.replace(/\/$/, "");
  const signupHref = `${base}/signup`;
  const who = a.name?.trim() ? `${esc(a.name)} (<strong>${esc(a.email)}</strong>)` : `<strong>${esc(a.email)}</strong>`;
  const wsCount = typeof a.workspaceCount === "number" ? a.workspaceCount : 0;
  const wsLine = wsCount > 0 ? ` and ${wsCount} owned workspace${wsCount === 1 ? "" : "s"}` : "";
  const when =
    new Date(a.deletedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

  const rows: Array<readonly [string, string]> = [
    ["Account", who],
    ["Deleted At", esc(when)],
    ["Owned Workspaces", wsCount > 0 ? `${wsCount} owned workspace${wsCount === 1 ? "" : "s"} erased` : "Personal profile &amp; credentials erased"],
    ["Purged Data", "Telegram webhooks, encrypted bot tokens, API keys, workflows &amp; storage files"],
  ];

  return {
    subject: "Your RelayNest account has been deleted",
    text: `Your RelayNest account (${a.email}) was permanently deleted on ${when}. If you did not request this deletion, contact ${SUPPORT_EMAIL} immediately.`,
    html: layout(
      "Your RelayNest account has been deleted",
      p(`This confirms that the RelayNest account for ${who}${wsLine} was permanently deleted on <strong style="color:#F8F8FF;">${esc(when)}</strong>.`) +
        p("All associated Telegram bot connections, encrypted tokens, API keys, automation workflows, knowledge base documents, and uploaded workspace assets have been permanently erased from our servers.") +
        detailsTable("Deletion Confirmation", rows) +
        note(
          `If you did not request account deletion, contact Help &amp; Support immediately at <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`,
          "danger",
        ) +
        button("Create New Account", signupHref) +
        fallbackLink(signupHref),
      a.appUrl,
      `Account deletion confirmed for ${a.email}.`,
      { badge: "Account Deletion" },
    ),
  };
}

export interface NotificationEmailInput {
  kind: string;
  category?: string;
  title: string;
  body?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  workspaceName?: string | null;
  actionUrl: string;
  appUrl: string;
  occurredAt?: Date;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

interface KindPresentation {
  badge: string;
  ctaLabel: string;
  contextParagraph: string;
  advisoryHtml?: string;
  advisoryTone?: "info" | "warning" | "danger";
}

function presentationForNotification(kind: string, base: string): KindPresentation {
  const forgotHref = esc(`${base}/forgot-password`);
  const securityHref = esc(`${base}/settings/security`);
  const apiKeysHref = esc(`${base}/settings/api-keys`);

  switch (kind) {
    case "login_detected":
      return {
        badge: "Sign-In Security Alert",
        ctaLabel: "Review Security & Sessions",
        contextParagraph:
          "We recorded a new sign-in session on your RelayNest account. Below is a summary of the authentication event for your security records.",
        advisoryHtml: `<strong style="color:#F8F8FF;">Was this you?</strong> If you just signed in, no action is needed. If you do not recognize this sign-in, <a href="${forgotHref}" target="_blank" rel="noopener noreferrer" style="color:#22D3EE;font-weight:700;text-decoration:underline;">reset your password immediately</a> and sign out other devices from <a href="${securityHref}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;font-weight:700;text-decoration:underline;">Security &amp; Access</a>.`,
        advisoryTone: "warning",
      };
    case "password_changed":
      return {
        badge: "Account Security",
        ctaLabel: "Open Security & Access",
        contextParagraph:
          "Your RelayNest login password was updated. Active workspace permissions and encrypted bot credentials remain intact.",
        advisoryHtml: `<strong style="color:#F8F8FF;">Didn&rsquo;t change your password?</strong> Recover your account right away via <a href="${forgotHref}" target="_blank" rel="noopener noreferrer" style="color:#22D3EE;font-weight:700;text-decoration:underline;">Forgot Password</a> and alert Help &amp; Support at <a href="mailto:${SUPPORT_EMAIL}" style="color:#22D3EE;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.`,
        advisoryTone: "danger",
      };
    case "sessions_revoked":
      return {
        badge: "Session Security",
        ctaLabel: "Review Active Security",
        contextParagraph:
          "All other signed-in browsers and devices were signed out of your RelayNest account. Only the session that triggered this action remains signed in.",
        advisoryHtml:
          "If you revoked sessions out of caution, we also recommend rotating your account password and workspace API keys.",
        advisoryTone: "info",
      };
    case "api_key_created":
    case "api_key_rotated":
    case "api_key_revoked":
    case "bot_token_updated":
      return {
        badge: "Credential & API Security",
        ctaLabel: kind === "bot_token_updated" ? "Manage Telegram Bots" : "Manage API Keys",
        contextParagraph:
          "A workspace credential or programmatic access token was modified. Review the event metadata below to confirm this matches an authorized change by your team.",
        advisoryHtml: `If this change was unexpected, revoke the credential immediately from <a href="${apiKeysHref}" target="_blank" rel="noopener noreferrer" style="color:#22D3EE;font-weight:700;text-decoration:underline;">API Keys</a> and audit recent workspace activity.`,
        advisoryTone: "warning",
      };
    case "bot_connected":
    case "agent_connected":
      return {
        badge: "Bot & Agent Status",
        ctaLabel: kind === "agent_connected" ? "Open AI Agents" : "Open My Bots",
        contextParagraph:
          "Your Telegram bot integration is live and ready to process incoming commands, webhook updates, and automated replies.",
      };
    case "bot_paused":
    case "bot_disconnected":
    case "bot_deleted":
    case "bot_deleted_telegram":
      return {
        badge: "Telegram Bot Alert",
        ctaLabel: "Check My Bots",
        contextParagraph:
          "Incoming Telegram updates for this bot are currently stopped or disconnected. Review its configuration in My Bots to resume or reconnect service.",
        advisoryHtml:
          kind === "bot_deleted_telegram"
            ? "Because the token was revoked or the bot was deleted inside Telegram (@BotFather), issue a fresh bot token or remove the stale bot entry in RelayNest."
            : undefined,
        advisoryTone: kind === "bot_deleted_telegram" ? "danger" : "warning",
      };
    case "automation_published":
    case "automation_unpublished":
      return {
        badge: "Workflow Status",
        ctaLabel: "Open Automations",
        contextParagraph:
          "Your automation workflow state changed. Triggers, cron schedules, and downstream Telegram actions follow the updated publish status.",
      };
    case "execution_failed":
    case "integration_failed":
    case "agent_execution_failed":
      return {
        badge: "Execution Failure",
        ctaLabel: "Inspect Execution Logs",
        contextParagraph:
          "An automated run or outbound delivery encountered an error. Inspect the step trace in RelayNest to view diagnostic details and retry.",
        advisoryTone: "danger",
      };
    case "plan_limit":
    case "plan_activated":
    case "plan_renewing":
    case "plan_expiring":
    case "subscription_cancelled":
    case "payment_refunded":
    case "payment_received":
    case "payment_failed":
      return {
        badge: "Billing & Plan",
        ctaLabel: "Open Billing & Quotas",
        contextParagraph:
          "Here is an update regarding your workspace subscription, billing status, or monthly plan usage.",
      };
    case "member_invited":
      return {
        badge: "Workspace Collaboration",
        ctaLabel: "Open Workspace Settings",
        contextParagraph:
          "Workspace membership or invitation settings were updated for your team.",
      };
    default:
      return {
        badge: "Workspace Notification",
        ctaLabel: "Open RelayNest",
        contextParagraph:
          "Here are the full details of the latest notification recorded for your RelayNest workspace.",
      };
  }
}

function inferSignInMethod(body?: string | null, meta?: Record<string, unknown>): string {
  const explicit = typeof meta?.authMethod === "string" ? meta.authMethod.trim() : "";
  if (explicit) return explicit;
  const rawMethod = typeof meta?.method === "string" ? meta.method.trim().toLowerCase() : "";
  if (rawMethod === "google") return "Google OAuth (SSO)";
  if (rawMethod === "password") return "Email & Password";
  const text = (body ?? "").toLowerCase();
  if (text.includes("google")) return "Google OAuth (SSO)";
  if (text.includes("password")) return "Email & Password";
  if (text.includes("oauth") || text.includes("email link") || rawMethod === "callback") {
    return "OAuth / Magic Email Link";
  }
  return "Authenticated Session";
}

/**
 * Renders any workspace/account notification (`notify()`) using the full Aurora branded template,
 * public RelayNest logo, Outlook VML button, structured event metadata table, and security guidance.
 */
export function notificationEmail(input: NotificationEmailInput): { subject: string; html: string; text: string } {
  const base = input.appUrl.replace(/\/$/, "");
  const pathSuffix = input.actionUrl.startsWith("/") ? input.actionUrl : "/settings/notifications";
  const targetHref = `${base}${pathSuffix}`;
  const prefsHref = `${base}/settings/notifications`;
  const when = formatEmailTimestamp(input.occurredAt ?? new Date(), input.timezone);
  const pres = presentationForNotification(input.kind, base);

  const cleanName = input.recipientName?.trim();
  const greeting = cleanName ? `Hi <strong style="color:#F8F8FF;">${esc(cleanName)}</strong>,` : "Hello,";
  const accountDisplay = cleanName
    ? `${esc(cleanName)} (<span style="color:#22D3EE;">${esc(input.recipientEmail)}</span>)`
    : `<span style="color:#22D3EE;">${esc(input.recipientEmail)}</span>`;

  const meta = input.metadata ?? {};
  const device = parseUserAgentSummary(typeof meta.userAgent === "string" ? meta.userAgent : null);
  const ip = formatClientIp(typeof meta.ip === "string" ? meta.ip : null);

  const rows: Array<readonly [string, string]> = [
    ["Event", `<strong style="color:#F8F8FF;">${esc(input.title)}</strong>`],
    ["Account", accountDisplay],
  ];

  if (input.workspaceName?.trim()) {
    rows.push(["Workspace", esc(input.workspaceName.trim())]);
  }
  if (input.kind === "login_detected") {
    rows.push(["Auth Method", esc(inferSignInMethod(input.body, meta))]);
  }
  if (device) {
    rows.push(["Device / Browser", esc(device)]);
  }
  if (ip) {
    rows.push(["IP Address", mono(ip)]);
  }
  rows.push(["Date & Time", esc(when)]);

  const summaryBody = input.body?.trim()
    ? p(esc(input.body.trim()))
    : "";

  const html = layout(
    input.title,
    p(greeting) +
      summaryBody +
      p(esc(pres.contextParagraph)) +
      detailsTable("Event Details", rows) +
      (pres.advisoryHtml ? note(pres.advisoryHtml, pres.advisoryTone ?? "info") : "") +
      button(pres.ctaLabel, targetHref) +
      fallbackLink(targetHref),
    base,
    input.body?.trim() ? `${input.title} — ${input.body.trim()}` : input.title,
    {
      badge: pres.badge,
      footerStripHtml: `Manage email &amp; in-app alert preferences anytime in <a href="${esc(prefsHref)}" target="_blank" rel="noopener noreferrer" style="color:#A78BFA;font-weight:700;text-decoration:none;">Notification settings</a>.`,
    },
  );

  const textLines = [
    cleanName ? `Hi ${cleanName},` : "Hello,",
    "",
    input.title,
    ...(input.body?.trim() ? [input.body.trim()] : []),
    "",
    pres.contextParagraph,
    "",
    `Account: ${cleanName ? `${cleanName} (${input.recipientEmail})` : input.recipientEmail}`,
    ...(input.workspaceName?.trim() ? [`Workspace: ${input.workspaceName.trim()}`] : []),
    ...(input.kind === "login_detected" ? [`Auth Method: ${inferSignInMethod(input.body, meta)}`] : []),
    ...(device ? [`Device / Browser: ${device}`] : []),
    ...(ip ? [`IP Address: ${ip}`] : []),
    `Date & Time: ${when}`,
    "",
    `${pres.ctaLabel}: ${targetHref}`,
    `Notification settings: ${prefsHref}`,
    `Help & Support: ${SUPPORT_EMAIL}`,
  ];

  return {
    subject: `[RelayNest] ${input.title}`,
    html,
    text: textLines.join("\n"),
  };
}
