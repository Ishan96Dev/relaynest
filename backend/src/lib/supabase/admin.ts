import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@backend/lib/env/public";
import { serverEnv } from "@backend/lib/env/server";

/** Privileged client. Server-only; bypasses RLS. Use only for credential and webhook operations. */
export function createAdminClient() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL!, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
