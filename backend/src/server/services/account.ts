import "server-only";
import { publicEnv } from "@backend/lib/env/public";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { BUCKETS } from "@backend/lib/supabase/storage";
import { type AuthContext } from "@backend/server/auth/context";
import { isEmailConfigured, sendEmail } from "@backend/server/email/mailer";
import { accountDeletedEmail } from "@backend/server/email/templates";
import { logEvent } from "@backend/server/logger";
import { cleanupTelegramBotOnDelete, loadToken } from "@backend/server/services/bots";

export interface DeleteAccountResult {
  deleted: true;
  email: string;
  deletedWorkspaces: number;
  confirmationEmailSent: boolean;
  deliveryChannel: "supabase-edge" | "brevo-smtp-api" | "none";
}

async function trySupabaseEdgeEmail(payload: {
  email: string;
  name?: string;
  deletedAt: string;
  workspaceCount: number;
  appUrl: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const pub = publicEnv();
  const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!pub.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) return false;
  try {
    const res = await fetch(`${pub.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-account-deleted`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function removeStorageFiles(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createAdminClient().storage.from(bucket).remove(paths);
  } catch {
    /* Best-effort storage cleanup */
  }
}

/**
 * Permanently deletes a user account:
 * 1. Tears down Telegram bots/webhooks owned solely by the user's workspaces.
 * 2. Erases owned storage assets, workspaces, and the Supabase Auth user record.
 * 3. Sends an account_deleted confirmation email via Supabase Edge Function or Brevo HTTP API.
 */
export async function deleteUserAccount(ctx: AuthContext): Promise<DeleteAccountResult> {
  const admin = createAdminClient();
  const userEmail = ctx.email;
  if (!userEmail) {
    throw new Error("Account email address could not be resolved.");
  }

  // Fetch user profile metadata before removing user row
  const { data: userRes } = await admin.auth.admin.getUserById(ctx.userId);
  const meta = (userRes?.user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_path?: string };
  const displayName = meta.full_name || meta.name || userEmail.split("@")[0];

  // Find all workspaces owned/created by this user
  const { data: ownedWorkspaces } = await admin
    .from("workspaces")
    .select("id, logo_path")
    .eq("created_by", ctx.userId);

  const wsIds = (ownedWorkspaces ?? []).map((w) => w.id as string);
  const wsLogoPaths = (ownedWorkspaces ?? []).map((w) => w.logo_path as string | null).filter((p): p is string => Boolean(p));

  // Best-effort cleanup of Telegram bots across all owned workspaces
  if (wsIds.length > 0) {
    const { data: bots } = await admin
      .from("bots")
      .select("id, workspace_id, avatar_path")
      .in("workspace_id", wsIds);

    for (const bot of bots ?? []) {
      try {
        const token = await loadToken(bot.id as string, bot.workspace_id as string);
        await cleanupTelegramBotOnDelete(token);
      } catch {
        /* Bot may already be deleted or revoked on Telegram */
      }
    }

    const botAvatars = (bots ?? []).map((b) => b.avatar_path as string | null).filter((p): p is string => Boolean(p));
    await removeStorageFiles(BUCKETS.avatars, botAvatars);
    await removeStorageFiles(BUCKETS.workspaceLogos, wsLogoPaths);
    await admin.from("workspaces").delete().in("id", wsIds);
  }

  if (meta.avatar_path) {
    await removeStorageFiles(BUCKETS.avatars, [meta.avatar_path]);
  }

  // Remove user profile & log anonymized security audit entry before user deletion
  await admin.from("profiles").delete().eq("id", ctx.userId);
  logEvent("auth", "info", "User account permanently deleted", {
    userId: ctx.userId,
    actorEmail: userEmail,
    workspaceId: ctx.workspaceId,
    deletedWorkspaces: wsIds.length,
  });

  // Delete Supabase Auth account permanently
  const { error: delErr } = await admin.auth.admin.deleteUser(ctx.userId);
  if (delErr) {
    throw new Error(`Could not delete Supabase account: ${delErr.message}`);
  }

  // Render branded deletion email (matches supabase/templates/account_deleted.html)
  const deletedAt = new Date().toISOString();
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const rendered = accountDeletedEmail({
    email: userEmail,
    name: displayName,
    deletedAt,
    workspaceCount: wsIds.length,
    appUrl,
  });

  let confirmationEmailSent = await trySupabaseEdgeEmail({
    email: userEmail,
    name: displayName,
    deletedAt,
    workspaceCount: wsIds.length,
    appUrl,
    subject: rendered.subject,
    html: rendered.html,
  });
  let deliveryChannel: DeleteAccountResult["deliveryChannel"] = confirmationEmailSent ? "supabase-edge" : "none";

  if (!confirmationEmailSent && isEmailConfigured()) {
    confirmationEmailSent = await sendEmail({
      to: { email: userEmail, name: displayName },
      subject: rendered.subject,
      html: rendered.html,
      tags: ["account_deleted", "security"],
    });
    if (confirmationEmailSent) deliveryChannel = "brevo-smtp-api";
  }

  return {
    deleted: true,
    email: userEmail,
    deletedWorkspaces: wsIds.length,
    confirmationEmailSent,
    deliveryChannel,
  };
}
