import "server-only";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  parseNotificationSettings,
  type NotificationSettings,
  type NotificationSettingsPatch,
} from "@backend/lib/notifications";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { recordUserAudit } from "@backend/server/audit";
import { requireAuth, type AuthContext } from "@backend/server/auth/context";

export interface NotificationSettingsRecord {
  settings: NotificationSettings;
  updatedAt: string | null;
}

/** Loads the authenticated user's notification settings from Supabase `public.user_settings`. */
export async function getNotificationSettings(ctx?: AuthContext): Promise<NotificationSettingsRecord> {
  if (!isSupabaseConfigured()) {
    return { settings: structuredClone(DEFAULT_NOTIFICATION_SETTINGS), updatedAt: null };
  }
  try {
    const auth = ctx ?? (await requireAuth());
    const { data, error } = await auth.supabase
      .from("user_settings")
      .select("value, updated_at")
      .eq("user_id", auth.userId)
      .eq("key", "notifications")
      .maybeSingle();
    if (error || !data) {
      return { settings: structuredClone(DEFAULT_NOTIFICATION_SETTINGS), updatedAt: null };
    }
    return {
      settings: parseNotificationSettings(data.value),
      updatedAt: (data.updated_at as string | null) ?? null,
    };
  } catch {
    return { settings: structuredClone(DEFAULT_NOTIFICATION_SETTINGS), updatedAt: null };
  }
}

/** Loads notification settings by user ID using the server admin client (used by `notify()` and webhooks). */
export async function getNotificationSettingsForUserId(userId: string): Promise<NotificationSettings> {
  if (!isSupabaseConfigured() || !userId) return structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  try {
    const { data } = await createAdminClient()
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "notifications")
      .maybeSingle();
    return data?.value ? parseNotificationSettings(data.value) : structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  }
}

/** Deep-merges a validated patch with the stored Supabase row and persists it under RLS. */
export async function saveNotificationSettings(
  ctx: AuthContext,
  patch: NotificationSettingsPatch,
): Promise<NotificationSettingsRecord> {
  const existing = await getNotificationSettings(ctx);
  const merged = mergeNotificationSettings(existing.settings, patch);

  const { data, error } = await ctx.supabase
    .from("user_settings")
    .upsert(
      { user_id: ctx.userId, key: "notifications", value: merged },
      { onConflict: "user_id,key" },
    )
    .select("value, updated_at")
    .single();

  if (error) {
    throw new Error("Could not save notification settings to Supabase.");
  }

  const changedSections = [
    ...(patch.inapp ? Object.keys(patch.inapp).map((k) => `inapp.${k}`) : []),
    ...(patch.email ? Object.keys(patch.email).map((k) => `email.${k}`) : []),
    ...Object.keys(patch).filter((k) => k !== "inapp" && k !== "email"),
  ];

  void recordUserAudit({
    userId: ctx.userId,
    userEmail: ctx.email,
    workspaceId: ctx.workspaceId,
    event: "settings.notifications_updated",
    pagePath: "/settings/notifications",
    detail: `Updated ${changedSections.slice(0, 8).join(", ")}${changedSections.length > 8 ? ` (+${changedSections.length - 8})` : ""}`,
  }).catch(() => undefined);

  return {
    settings: parseNotificationSettings(data.value),
    updatedAt: (data.updated_at as string | null) ?? new Date().toISOString(),
  };
}

/** Resets the user's notification settings in Supabase `public.user_settings` back to defaults. */
export async function resetNotificationSettings(ctx: AuthContext): Promise<NotificationSettingsRecord> {
  const defaults = structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  const { data, error } = await ctx.supabase
    .from("user_settings")
    .upsert(
      { user_id: ctx.userId, key: "notifications", value: defaults },
      { onConflict: "user_id,key" },
    )
    .select("value, updated_at")
    .single();

  if (error) {
    throw new Error("Could not reset notification settings in Supabase.");
  }

  void recordUserAudit({
    userId: ctx.userId,
    userEmail: ctx.email,
    workspaceId: ctx.workspaceId,
    event: "settings.notifications_reset",
    pagePath: "/settings/notifications",
    detail: "Reset all notification settings to defaults",
  }).catch(() => undefined);

  return {
    settings: parseNotificationSettings(data.value),
    updatedAt: (data.updated_at as string | null) ?? new Date().toISOString(),
  };
}
