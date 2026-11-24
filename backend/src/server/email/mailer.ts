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
  return Boolean(e.apiKey && e.fromAddress);
};
/**
 * Sends one transactional email through Brevo's HTTP API.
 * Never throws: an email problem must not break a payment or a bot run. Returns false when nothing was sent.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  const env = brevoEnv();
  if (!env.apiKey || !env.fromAddress) {
    console.warn("[email] Brevo is not configured (BREVO_API_KEY, MAIL_FROM_ADDRESS); skipped:", input.subject);
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
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
      console.error("[email] Brevo rejected the message, status", res.status);
      return false;
    }
    return true;
  } catch {
    console.error("[email] Could not reach Brevo.");
    return false;
  }
}
