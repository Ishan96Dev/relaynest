import "server-only";
const read = (name: string) => process.env[name]?.trim() || undefined;
/** Razorpay credentials. Optional at startup: billing routes answer "not configured" until they are set. */
export function razorpayEnv() {
  return {
    keyId: read("RAZORPAY_KEY_ID"),
    keySecret: read("RAZORPAY_KEY_SECRET"),
    webhookSecret: read("RAZORPAY_WEBHOOK_SECRET"),
  };
}
/** Brevo transactional email (HTTP API, which also works on Cloudflare Workers where raw SMTP does not). */
export function brevoEnv() {
  return {
    apiKey: read("BREVO_API_KEY"),
    fromAddress: read("MAIL_FROM_ADDRESS"),
    fromName: read("MAIL_FROM_NAME") ?? "RelayNest",
  };
}
/** Shared secret for the scheduler endpoint (Cloudflare Cron Trigger, or any external cron). */
export function cronSecret() {
  return read("CRON_SECRET");
}
/** Optional NVIDIA prices in USD per million tokens. NVIDIA Build is a free trial tier, so both default to 0. */
export function nvidiaPricing() {
  const num = (n: string) => { const v = Number(read(n)); return Number.isFinite(v) && v > 0 ? v : 0; };
  return { inputPerMTok: num("NVIDIA_PRICE_INPUT_PER_MTOK"), outputPerMTok: num("NVIDIA_PRICE_OUTPUT_PER_MTOK") };
}
