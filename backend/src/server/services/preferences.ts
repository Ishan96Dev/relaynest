import "server-only";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  userPreferencesSchema,
  type UserPreferences,
  type UserPreferencesPatch,
} from "@backend/lib/preferences";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { recordUserAudit } from "@backend/server/audit";
import { requireAuth, type AuthContext } from "@backend/server/auth/context";

export interface PreferencesRecord {
  preferences: UserPreferences;
  updatedAt: string | null;
}

/** Loads the authenticated user's preferences from Supabase `public.user_settings` (falls back to defaults in demo mode). */
export async function getUserPreferences(ctx?: AuthContext): Promise<PreferencesRecord> {
  if (!isSupabaseConfigured()) {
    return { preferences: { ...DEFAULT_PREFERENCES }, updatedAt: null };
  }
  try {
    const auth = ctx ?? (await requireAuth());
    const { data, error } = await auth.supabase
      .from("user_settings")
      .select("value, updated_at")
      .eq("user_id", auth.userId)
      .eq("key", "preferences")
      .maybeSingle();
    if (error || !data) {
      return { preferences: { ...DEFAULT_PREFERENCES }, updatedAt: null };
    }
    return {
      preferences: parsePreferences(data.value),
      updatedAt: (data.updated_at as string | null) ?? null,
    };
  } catch {
    return { preferences: { ...DEFAULT_PREFERENCES }, updatedAt: null };
  }
}

/** Loads preferences by user ID using the server admin client (used by auth callback before redirecting). */
export async function getUserPreferencesForUserId(userId: string): Promise<UserPreferences> {
  if (!isSupabaseConfigured() || !userId) return { ...DEFAULT_PREFERENCES };
  try {
    const { data } = await createAdminClient()
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "preferences")
      .maybeSingle();
    return data?.value ? parsePreferences(data.value) : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Merges a validated preference patch with the stored Supabase row and persists it under RLS. */
export async function saveUserPreferences(ctx: AuthContext, patch: UserPreferencesPatch): Promise<PreferencesRecord> {
  const existing = await getUserPreferences(ctx);
  const merged = userPreferencesSchema.parse({ ...existing.preferences, ...patch });

  const { data, error } = await ctx.supabase
    .from("user_settings")
    .upsert(
      { user_id: ctx.userId, key: "preferences", value: merged },
      { onConflict: "user_id,key" },
    )
    .select("value, updated_at")
    .single();

  if (error) {
    throw new Error("Could not save preferences to Supabase.");
  }

  void recordUserAudit({
    userId: ctx.userId,
    userEmail: ctx.email,
    event: "settings.preferences_updated",
    pagePath: "/settings/preferences",
    detail: `Updated ${Object.keys(patch).join(", ")}`,
  }).catch(() => undefined);

  return {
    preferences: parsePreferences(data.value),
    updatedAt: (data.updated_at as string | null) ?? new Date().toISOString(),
  };
}

/** Resets the user's preferences in Supabase `public.user_settings` back to defaults. */
export async function resetUserPreferences(ctx: AuthContext): Promise<PreferencesRecord> {
  const defaults = { ...DEFAULT_PREFERENCES };
  const { data, error } = await ctx.supabase
    .from("user_settings")
    .upsert(
      { user_id: ctx.userId, key: "preferences", value: defaults },
      { onConflict: "user_id,key" },
    )
    .select("value, updated_at")
    .single();

  if (error) {
    throw new Error("Could not reset preferences in Supabase.");
  }

  void recordUserAudit({
    userId: ctx.userId,
    userEmail: ctx.email,
    event: "settings.preferences_reset",
    pagePath: "/settings/preferences",
    detail: "Reset all preferences to defaults",
  }).catch(() => undefined);

  return {
    preferences: parsePreferences(data.value),
    updatedAt: (data.updated_at as string | null) ?? new Date().toISOString(),
  };
}
