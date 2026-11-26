import "server-only";
import { brevoEnv } from "@backend/lib/env/integrations";
export interface EmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  /** Brevo tags make it easy to filter these emails in the Brevo dashboard. */
  tags?: string[];
}
export const isEmailConfigured = () => {
  const e = brevoEnv();
  return Boolean(e.apiKey && !e.isSmtpKey && e.fromAddress);
};

export interface BrevoProbeResult {
  ok: boolean;
  status: "up" | "down" | "unconfigured";
  detail: string;
}

/**
 * Verifies Brevo transactional email configuration and live v3 REST API connectivity.
 * Catches common misconfigurations such as using an SMTP key (`xsmtpsib-`) instead of
 * a v3 REST API key (`xkeysib-`) or omitting `MAIL_FROM_ADDRESS`.
 */
export async function probeBrevoHealth(fetchImpl: typeof fetch = fetch): Promise<BrevoProbeResult> {
  const env = brevoEnv();
  if (!env.apiKey) {
    return { ok: false, status: "unconfigured", detail: "BREVO_API_KEY not set (set BREVO_API_KEY & MAIL_FROM_ADDRESS)" };
  }
  if (env.isSmtpKey) {
    const senderSuffix = env.fromAddress ? "" : " · MAIL_FROM_ADDRESS also missing";
    return {
      ok: false,
      status: "down",
      detail: `Wrong key type: xsmtpsib- is an SMTP key; use a v3 API key (xkeysib-) from Brevo → SMTP & API → API Keys${senderSuffix}`,
    };
  }
  const res = await fetchImpl("https://api.brevo.com/v3/account", {
    headers: { "api-key": env.apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    if (res.status === 401) {
      return {
        ok: false,
        status: "down",
        detail: "API key rejected (HTTP 401 · use a v3 API key xkeysib- & check Authorized IPs in Brevo)",
      };
    }
    return { ok: false, status: "down", detail: `Rejected (HTTP ${res.status})` };
  }
  const account = (await res.json().catch(() => ({}))) as { email?: string };
  if (!env.fromAddress) {
    const hint = account.email ? ` (e.g. ${account.email})` : "";
    return {
      ok: false,
      status: "unconfigured",
      detail: `API key valid · set MAIL_FROM_ADDRESS${hint}`,
    };
  }
  return { ok: true, status: "up", detail: `Reachable · Sender: ${env.fromAddress}` };
}

/**
 * Sends one transactional email through Brevo's HTTP API.
 * Never throws: an email problem must not break a payment or a bot run. Returns false when nothing was sent.
 */
export async function sendEmail(input: EmailInput, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const env = brevoEnv();
  if (env.isSmtpKey) {
    console.error("[email] BREVO_API_KEY starts with xsmtpsib- (SMTP key); Brevo HTTP API requires a v3 API key (xkeysib-). Skipped:", input.subject);
    return false;
  }
  if (!env.apiKey || !env.fromAddress) {
    console.warn("[email] Brevo is not configured (BREVO_API_KEY, MAIL_FROM_ADDRESS); skipped:", input.subject);
    return false;
  }
  try {
    const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: env.fromAddress, name: env.fromName },
        to: [input.to],
        subject: input.subject,
        htmlContent: input.html,
        ...(input.text ? { textContent: input.text } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[email] Brevo rejected the message, status", res.status, errBody.slice(0, 200));
      return false;
    }
    return true;
  } catch {
    console.error("[email] Could not reach Brevo.");
    return false;
  }
}
