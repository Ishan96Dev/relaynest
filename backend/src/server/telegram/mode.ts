import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { serverEnv } from "@backend/lib/env/server";

/**
 * Webhooks need a public https URL, which a laptop does not have. `auto` uses webhooks when NEXT_PUBLIC_APP_URL is https
 * and otherwise has the dev server poll Telegram, so bots work locally with no tunnel. Production should use https.
 */
export function updatesMode(): "webhook" | "polling" {
  const mode = serverEnv().TELEGRAM_UPDATES_MODE;
  if (mode !== "auto") return mode;
  return publicEnv().NEXT_PUBLIC_APP_URL.startsWith("https://") ? "webhook" : "polling";
}