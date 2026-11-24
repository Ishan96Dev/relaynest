import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { escapeHtml } from "@backend/lib/security/phishing";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { sendEmail } from "@backend/server/email/mailer";
import { emailFooterHtml } from "@backend/server/email/templates";
import { logEvent } from "@backend/server/logger";

export interface NotifyInput {
  workspaceId: string;
  userId: string;
  kind: string;
  title: string;
  body?: string;
  /** Skip when this user already got the same kind within this many hours. */
  dedupeHours?: number;
  /** Optional email key in user_settings.notifications.email (e.g. "login", "accountSecurity", "botConnected"). */
  emailKey?: string;
}

const INAPP_KEY: Record<string, { key: string; critical?: boolean }> = {
  bot_created: { key: "botActivity" },
  bot_connected: { key: "botActivity" },
  bot_updated: { key: "botActivity" },
  bot_photo_updated: { key: "botActivity" },
  bot_activated: { key: "botActivity" },
  bot_paused: { key: "botActivity" },
  bot_disconnected: { key: "botActivity" },
  bot_deleted: { key: "botActivity" },
  bot_deleted_telegram: { key: "botActivity", critical: true },
  automation_published: { key: "automationEvents" },
  automation_unpublished: { key: "automationEvents" },
  automation_succeeded: { key: "automationEvents" },
  execution_failed: { key: "executionFailures", critical: true },
  api_key_created: { key: "security", critical: true },
  api_key_revoked: { key: "security", critical: true },
  integration_connected: { key: "workspace" },
  integration_tested: { key: "workspace" },
  integration_failed: { key: "executionFailures", critical: true },
  integration_deleted: { key: "workspace" },
  webhook_triggered: { key: "automationEvents" },
  workspace_updated: { key: "workspace" },
  member_invited: { key: "workspace" },
  plan_limit: { key: "system", critical: true },
  system_announcement: { key: "system" },
  login_detected: { key: "security", critical: true },
  password_changed: { key: "security", critical: true },
  profile_updated: { key: "security" },
  payment_received: { key: "billing", critical: true },
  payment_failed: { key: "billing", critical: true },
  plan_activated: { key: "billing", critical: true },
  plan_renewing: { key: "billing", critical: true },
  plan_expiring: { key: "billing", critical: true },
  subscription_cancelled: { key: "billing", critical: true },
};

interface Prefs {
  email?: Record<string, boolean>;
  inapp?: Record<string, boolean>;
  frequency?: string;
  disableNonCritical?: boolean;
}

/**
 * Writes one in-app notification (honoring user_settings.notifications) and optionally sends a matching Brevo email.
 * Never throws: a notification must not break the action that caused it.
 */
export async function notify(a: NotifyInput): Promise<void> {
  try {
    const db = createAdminClient();
    if (a.dedupeHours) {
      const since = new Date(Date.now() - a.dedupeHours * 3_600_000).toISOString();
      const { data } = await db.from("notifications").select("id").eq("user_id", a.userId).eq("kind", a.kind).gte("created_at", since).limit(1);
      if (data?.length) return;
    }

    const { data: settings } = await db.from("user_settings").select("value").eq("user_id", a.userId).eq("key", "notifications").maybeSingle();
    const prefs = (settings?.value ?? {}) as Prefs;
    const rule = INAPP_KEY[a.kind];
    const critical = Boolean(rule?.critical);
    const inappAllowed =
      (!prefs.disableNonCritical || critical) &&
      (prefs.frequency !== "off" || critical) &&
      (!rule || rule.key === "billing" || prefs.inapp?.[rule.key] !== false);

    if (inappAllowed) {
      await db.from("notifications").insert({ workspace_id: a.workspaceId, user_id: a.userId, kind: a.kind, title: a.title, body: a.body ?? null });
      logEvent("db", "info", `Notification [${a.kind}] -> ${a.title}`, { userId: a.userId });
    }

    if (a.emailKey && prefs.email?.[a.emailKey] !== false && (critical || !prefs.disableNonCritical)) {
      const { data: u } = await db.auth.admin.getUserById(a.userId);
      const email = u.user?.email;
      if (email) {
        const appUrl = publicEnv().NEXT_PUBLIC_APP_URL;
        await sendEmail({
          to: { email },
          subject: `[RelayNest] ${a.title}`,
          html: `<div style="background:#08081A;padding:32px 16px;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
            <div style="max-width:560px;margin:0 auto;padding:28px 32px;border-radius:18px;background:#131130;color:#F8F8FF;border:1px solid #2D2868;">
              <p style="margin:0 0 8px;color:#A78BFA;font-weight:800;letter-spacing:0.3px;">RelayNest</p>
              <h2 style="margin:0 0 12px;color:#F8F8FF;">${escapeHtml(a.title)}</h2>
              <p style="margin:0 0 20px;color:#D2CFF0;line-height:1.6;">${escapeHtml(a.body ?? "")}</p>
              <a href="${appUrl}/settings/notifications" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#7C5CFF,#06B6D4);color:#ffffff;text-decoration:none;font-weight:700;">Open RelayNest</a>
            </div>
            <div style="max-width:560px;margin:20px auto 0;text-align:center;">
              ${emailFooterHtml(appUrl)}
            </div>
          </div>`,
          tags: ["notification", a.kind],
        });
      }
    }
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : e);
  }
}

/** Notifies every owner and admin of a workspace (billing and plan events). */
export async function notifyOwners(workspaceId: string, n: Omit<NotifyInput, "workspaceId" | "userId">): Promise<void> {
  try {
    const { data } = await createAdminClient().from("workspace_members").select("user_id").eq("workspace_id", workspaceId).in("role", ["owner", "admin"]);
    await Promise.all((data ?? []).map((m) => notify({ ...n, workspaceId, userId: m.user_id as string })));
  } catch (e) {
    console.error("[notify] owners failed:", e instanceof Error ? e.message : e);
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

/**
 * Reminds owners 3 days before a paid period ends: a recurring plan renews on that date, a one-time (prepaid) plan expires.
 * Called from the scheduler tick; the dedupe window keeps it to one reminder per period.
 */
export async function sendRenewalReminders(): Promise<number> {
  const db = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const { data } = await db.from("subscriptions").select("workspace_id, plan, mode, current_period_end, cancel_at_period_end")
    .eq("status", "active").neq("plan", "free").gt("current_period_end", now.toISOString()).lte("current_period_end", soon);
  let sent = 0;
  for (const s of data ?? []) {
    const end = day(s.current_period_end as string);
    const plan = String(s.plan).replace(/^./, (c) => c.toUpperCase());
    const ends = s.mode === "one_time" || s.cancel_at_period_end;
    await notifyOwners(s.workspace_id as string, {
      kind: ends ? "plan_expiring" : "plan_renewing",
      title: ends ? `Your ${plan} plan ends on ${end}` : `Your ${plan} plan renews on ${end}`,
      body: ends ? "Buy another period or switch to auto-renew in Billing to keep your plan." : "Your next billing cycle is coming up. Nothing to do unless you want to change plans.",
      dedupeHours: 24 * 6,
    });
    sent++;
  }
  return sent;
}
