import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { logEvent } from "@backend/server/logger";
import { publishKafkaEvent } from "@backend/server/queue/kafka";

export interface AuditEntry {
  userId?: string | null;
  userEmail?: string | null;
  workspaceId?: string | null;
  event: string;
  pagePath?: string | null;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Records a user movement (login, logout, session timeout, page visit, resource change) in `user_audit_logs`. Never throws. */
export async function recordUserAudit(a: AuditEntry): Promise<void> {
  try {
    await createAdminClient().from("user_audit_logs").insert({
      user_id: a.userId ?? null,
      user_email: a.userEmail ?? null,
      workspace_id: a.workspaceId ?? null,
      event: a.event,
      page_path: a.pagePath ?? null,
      detail: a.detail ?? null,
      ip: a.ip ?? null,
      user_agent: a.userAgent ? a.userAgent.slice(0, 240) : null,
    });
    if (a.event.startsWith("auth.") || a.event.startsWith("session.")) {
      logEvent("auth", "info", `${a.event} (${a.userEmail ?? a.userId ?? "anon"})`, a.detail ? { detail: a.detail } : undefined);
    }
    void publishKafkaEvent("audit.events", { userId: a.userId, userEmail: a.userEmail, workspaceId: a.workspaceId, event: a.event, pagePath: a.pagePath }, a.userId ?? undefined);
  } catch (e) {
    console.error("[audit] insert failed:", e instanceof Error ? e.message : e);
  }
}
