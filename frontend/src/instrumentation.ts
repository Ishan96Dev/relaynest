/**
 * Runs once when a persistent Node.js Next.js server starts (local dev / self-hosted Node).
 * Skipped on Cloudflare Workers and in production unless polling/in-process scheduling is explicitly enabled,
 * avoiding heavy module evaluation during serverless cold starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") ||
    process.env.WORKERS_CI ||
    process.env.CF_PAGES ||
    process.env.RELAYNEST_DEPLOY_TARGET === "cloudflare"
  ) {
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const wantPolling = !isProd || process.env.TELEGRAM_UPDATES_MODE === "polling";
  const wantScheduler = !isProd || process.env.SCHEDULER_IN_PROCESS === "true";

  if (wantPolling) {
    const { startTelegramPolling } = await import("@backend/server/services/telegram-polling");
    startTelegramPolling();
  }
  if (wantScheduler) {
    const { startScheduler } = await import("@backend/server/services/scheduler");
    startScheduler();
  }
}
