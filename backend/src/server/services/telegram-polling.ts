import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { loadToken, markBotDeletedOnTelegram } from "@backend/server/services/bots";
import { processPolledUpdate } from "@backend/server/services/telegram-webhook";
import { getUpdates, isTelegramBotDeletedError } from "@backend/server/telegram/client";
import { updatesMode } from "@backend/server/telegram/mode";

const INTERVAL_MS = 1_500;

/**
 * Local-development replacement for webhooks: every 1.5 s, ask Telegram for new messages of each bot that was activated
 * in polling mode and handle them like webhook deliveries. Started once per server process by instrumentation.ts.
 * Errors are logged without tokens or message text.
 */
export function startTelegramPolling() {
  const g = globalThis as { __rnTelegramPolling?: boolean };
  if (g.__rnTelegramPolling) return; // survives hot reloads: never run two loops
  if (!isSupabaseConfigured()) return;
  let mode: string;
  try { mode = updatesMode(); } catch { return; } // server env incomplete: nothing to poll for
  if (mode !== "polling") return;
  g.__rnTelegramPolling = true;
  console.log("[telegram] polling for updates (no public URL needed). Set TELEGRAM_UPDATES_MODE=webhook to use webhooks instead.");

  /** Next update_id to request per bot. Telegram forgets updates older than this, so nothing is handled twice. */
  const offsets = new Map<string, number>();

  async function pollBot(bot: { id: string; workspace_id: string }) {
    const token = await loadToken(bot.id, bot.workspace_id);
    let updates;
    try {
      updates = await getUpdates(token, offsets.get(bot.id));
    } catch (err) {
      if (isTelegramBotDeletedError(err)) {
        offsets.delete(bot.id);
        await markBotDeletedOnTelegram(bot.id, bot.workspace_id);
        return;
      }
      throw err;
    }
    for (const update of updates) {
      offsets.set(bot.id, update.update_id + 1);
      try {
        await processPolledUpdate(bot.id, update);
      } catch (e) {
        console.error(`[telegram] update ${update.update_id} failed:`, e instanceof Error ? e.message : "unknown");
      }
    }
  }

  async function tick() {
    try {
      const { data } = await createAdminClient().from("bots").select("id, workspace_id").eq("status", "active").eq("webhook_status", "polling");
      const active = new Set((data ?? []).map((b) => b.id as string));
      for (const id of offsets.keys()) if (!active.has(id)) offsets.delete(id);
      await Promise.all((data ?? []).map((b) => pollBot(b as { id: string; workspace_id: string }).catch((e) => console.error("[telegram] poll failed:", e instanceof Error ? e.message : "unknown"))));
    } catch (e) {
      console.error("[telegram] polling error:", e instanceof Error ? e.message : "unknown");
    }
  }

  void (async () => {
    for (;;) {
      await tick();
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  })();
}
