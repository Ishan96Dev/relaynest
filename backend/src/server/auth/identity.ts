import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "../../lib/env/public";
import { createClient } from "../../lib/supabase/server";

export interface Identity {
  id: string;
  email: string | undefined;
  name: string | undefined;
  /** Storage path of the profile picture (kept in the token so the header needs no database call). */
  avatarPath: string | undefined;
}

/** One Supabase client per request (deduplicated across layout, pages and helpers). */
export const getSupabase = cache(() => createClient());

/**
 * Verified identity of the caller. `getClaims()` checks the JWT signature and expiry locally (no network call
 * when the project uses asymmetric signing keys, and it falls back to the Auth server otherwise), so identity
 * costs microseconds instead of a round trip. The tradeoff is that a revoked session stays valid until its token
 * expires (default 1 hour); data access is still enforced by row-level security on every query.
 */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_path?: string };
  return { id: claims.sub, email: claims.email, name: meta.full_name ?? meta.name, avatarPath: meta.avatar_path };
});