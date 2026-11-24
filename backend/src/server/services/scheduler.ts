import "server-only";
import { nextRun } from "@backend/lib/cron";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { sendRenewalReminders } from "@backend/server/notifications";
import { runWorkflow } from "@backend/server/services/workflow-runner";
export interface TickResult { due: number; ran: number; skipped: number }
/**
 * Runs every schedule whose time has come. Call it once a minute (Cloudflare Cron Trigger or any scheduler hitting
 * /api/cron/tick; in local development the dev server calls it itself).
 *
 * Each row is claimed with a compare-and-set on next_run_at, so two overlapping ticks never run the same slot twice.
 * After downtime a schedule runs once, not once per missed slot.
 */
export async function runDueSchedules(limit = 25): Promise<TickResult> {
  const db = createAdminClient();
  const now = new Date();
  // Billing: remind owners a few days before a plan renews or expires (deduped, so this is cheap on every tick).
  await sendRenewalReminders().catch((e) => console.error("[scheduler] renewal reminders failed:", e instanceof Error ? e.message : "unknown"));
  const { data: due } = await db.from("workflow_schedules").select("workflow_id, cron, timezone, next_run_at")
    .eq("enabled", true).lte("next_run_at", now.toISOString()).order("next_run_at", { ascending: true }).limit(limit);
  const result: TickResult = { due: due?.length ?? 0, ran: 0, skipped: 0 };
  for (const s of due ?? []) {
    const slot = s.next_run_at as string;
    const following = nextRun(s.cron as string, now, s.timezone as string);
    const { data: claimed } = await db.from("workflow_schedules")
      .update({ next_run_at: following?.toISOString() ?? null, enabled: following !== null, last_run_at: now.toISOString() })
      .eq("workflow_id", s.workflow_id).eq("next_run_at", slot).select("workflow_id");
    if (!claimed?.length) { result.skipped++; continue; }
    let status = "error";
    try {
      const r = await runWorkflow({ workflowId: s.workflow_id as string, trigger: "schedule", payload: { scheduledFor: slot, cron: s.cron }, idempotencyKey: `sched:${s.workflow_id}:${slot}` });
      status = r.outcome === "ran" ? r.result.status : `skipped:${r.reason}`;
      if (r.outcome === "ran") result.ran++; else result.skipped++;
    } catch {
      result.skipped++;
    }
    await db.from("workflow_schedules").update({ last_status: status }).eq("workflow_id", s.workflow_id);
  }
  return result;
}
/**
 * Local development and self-hosting: tick once a minute inside the server process.
 * In production it stays off unless SCHEDULER_IN_PROCESS=true, because Cloudflare Workers (and any multi-instance host)
 * should use a Cron Trigger that calls /api/cron/tick instead. Safe with several instances: ticks claim rows atomically.
 */
export function startScheduler() {
  const g = globalThis as { __rnScheduler?: boolean };
  if (g.__rnScheduler || !isSupabaseConfigured()) return;
  if (process.env.NODE_ENV === "production" && process.env.SCHEDULER_IN_PROCESS !== "true") return;
  g.__rnScheduler = true;
  console.log("[scheduler] checking automation schedules every minute");
  setInterval(() => {
    runDueSchedules().catch((e) => console.error("[scheduler] tick failed:", e instanceof Error ? e.message : "unknown"));
  }, 60_000).unref?.();
}