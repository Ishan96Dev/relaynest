import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@backend/lib/env/public";
import { serverEnv } from "@backend/lib/env/server";

let cachedClient: SupabaseClient | null = null;
let cachedKey = "";

/**
 * Privileged stateless service-role client. Server-only; bypasses RLS.
 * Reused per warm isolate/process for the same credentials to avoid repeated SDK initialization overhead.
 */
export function createAdminClient(): SupabaseClient {
  const url = publicEnv().NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = serverEnv().SUPABASE_SECRET_KEY;
  const cacheKey = `${url}|${secretKey}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;
  cachedClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cachedKey = cacheKey;
  return cachedClient;
}
