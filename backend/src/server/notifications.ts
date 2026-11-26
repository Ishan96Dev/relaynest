import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import {
  isWithinQuietHours,
  shouldDeliverNotification,
  type EmailNotificationKey,
} from "@backend/lib/notifications";
import { escapeHtml } from "@backend/lib/security/phishing";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { sendEmail } from "@backend/server/email/mailer";
import { emailFooterHtml } from "@backend/server/email/templates";
import { logEvent } from "@backend/server/logger";
import { getNotificationSettingsForUserId } from "@backend/server/services/notification-settings";

export interface NotifyInput {
  workspaceId: string;
  userId: string;
  kind: string;
  title: string;
  body?: string;
  /** Skip when this user already got the same kind within this many hours. */
  dedupeHours?: number;
  /** When true, dedupe checks both kind and exact title (e.g. per-automation failure cooldown). */
  dedupeByTitle?: boolean;
  /** Optional email key in user_settings.notifications.email (e.g. "login", "accountSecurity", "botConnected", "billing"). */
  emailKey?: EmailNotificationKey;
  /** Optional relative app path opened when clicking the in-app notification. */
  actionUrl?: string;
  /** Optional structured JSON metadata stored alongside the notification. */
  metadata?: Record<string, unknown>;
  /** Optional custom email subject/HTML/tags (still gated by user notification preferences). */
  emailPayload?: { subject: string; html: string; tags?: string[] };
}

export interface NotifyResult {
  inapp: boolean;
  email: boolean;
}

/**
 * Checks whether a transactional/alert email category is allowed for a given user under their saved notification preferences.
 */
export async function canSendEmailNotification(
  userId: string,
  emailKey: EmailNotificationKey,
  opts?: { critical?: boolean; now?: Date },
): Promise<boolean> {
  try {
    const prefs = await getNotificationSettingsForUserId(userId);
    if (prefs.email[emailKey] === false) return false;
    if (opts?.critical) return true;
    if (prefs.disableNonCritical || prefs.frequency === "off" || isWithinQuietHours(prefs, opts?.now)) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Writes one in-app notification (honoring user_settings.notifications) and optionally sends a matching Brevo email.
 * Respects per-category toggles (including optional in-app/email login alerts), quiet hours, frequency, and disableNonCritical.
 * Never throws: a notification must not break the action that caused it.
 */
export async function notify(a: NotifyInput): Promise<NotifyResult> {
  try {
    const prefs = await getNotificationSettingsForUserId(a.userId);
    const decision = shouldDeliverNotification(a.kind, prefs, { emailKey: a.emailKey ?? null });
    if (!decision.sendInApp && !decision.sendEmail) {
      return { inapp: false, email: false };
    }

    const db = createAdminClient();
    if (a.dedupeHours) {
      const since = new Date(Date.now() - a.dedupeHours * 3_600_000).toISOString();
      let q = db
        .from("notifications")
        .select("id")
        .eq("user_id", a.userId)
        .eq("kind", a.kind)
        .gte("created_at", since);
      if (a.dedupeByTitle) q = q.eq("title", a.title);
      const { data } = await q.limit(1);
      if (data?.length) return { inapp: false, email: false };
    }

    const actionUrl = a.actionUrl ?? decision.actionUrl;
    let inappSent = false;
    let emailSent = false;

    if (decision.sendInApp) {
      const { error } = await db.from("notifications").insert({
        workspace_id: a.workspaceId,
        user_id: a.userId,
        kind: a.kind,
        category: decision.category,
        title: a.title,
        body: a.body ?? null,
        action_url: actionUrl,
        metadata: a.metadata ?? {},
      });
      if (!error) {
        inappSent = true;
        logEvent("db", "info", `Notification [${a.kind}/${decision.category}] -> ${a.title}`, { userId: a.userId });
      }
    }

    if (decision.sendEmail) {
      const { data: u } = await db.auth.admin.getUserById(a.userId);
      const email = u.user?.email;
      if (email) {
        const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
        if (a.emailPayload) {
          await sendEmail({
            to: { email },
            subject: a.emailPayload.subject,
            html: a.emailPayload.html,
            tags: a.emailPayload.tags ?? ["notification", a.kind],
          });
        } else {
          const targetHref = `${appUrl}${actionUrl.startsWith("/") ? actionUrl : "/settings/notifications"}`;
          await sendEmail({
            to: { email },
            subject: `[RelayNest] ${a.title}`,
            html: `<div style="background:#08081A;padding:32px 16px;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
              <div style="max-width:560px;margin:0 auto;padding:28px 32px;border-radius:18px;background:#131130;color:#F8F8FF;border:1px solid #2D2868;">
                <p style="margin:0 0 8px;color:#A78BFA;font-weight:800;letter-spacing:0.3px;">RelayNest</p>
                <h2 style="margin:0 0 12px;color:#F8F8FF;">${escapeHtml(a.title)}</h2>
                <p style="margin:0 0 20px;color:#D2CFF0;line-height:1.6;">${escapeHtml(a.body ?? "")}</p>
                <a href="${escapeHtml(targetHref)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#7C5CFF,#06B6D4);color:#ffffff;text-decoration:none;font-weight:700;">Open RelayNest</a>
                <p style="margin:18px 0 0;font-size:12px;color:#9E9AC4;">Manage these alerts anytime in <a href="${escapeHtml(appUrl)}/settings/notifications" style="color:#A78BFA;text-decoration:none;">Notification settings</a>.</p>
              </div>
              <div style="max-width:560px;margin:20px auto 0;text-align:center;">
                ${emailFooterHtml(appUrl)}
              </div>
            </div>`,
            tags: ["notification", a.kind],
          });
        }
        emailSent = true;
      }
    }

    return { inapp: inappSent, email: emailSent };
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : e);
    return { inapp: false, email: false };
  }
}

/** Notifies every owner and admin of a workspace (billing, plan, failure, and system events). */
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
      emailKey: "billing",
      dedupeHours: 24 * 6,
    });
    sent++;
  }
  return sent;
}
