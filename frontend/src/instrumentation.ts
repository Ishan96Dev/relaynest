/** Runs once when the Next.js server starts. Used to start local Telegram polling (see telegram-polling.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTelegramPolling } = await import("@backend/server/services/telegram-polling");
  startTelegramPolling();
  const { startScheduler } = await import("@backend/server/services/scheduler");
  startScheduler();
}
