"use client";
import * as React from "react";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { createClient } from "@backend/lib/supabase/lazy";

export type SettingKey = "preferences" | "notifications";

/**
 * Account-level settings. Reads the device cache first so the page paints at once, then the signed-in user's
 * row in `public.user_settings` (RLS: own rows only) replaces it. Saving writes both. Without Supabase
 * (demo mode) it behaves as a plain device-local setting.
 */
export function useSyncedSetting<T extends object>(key: SettingKey, initial: T) {
  const initialRef = React.useRef(initial);
  const touched = React.useRef(false);
  const [value, setValueState] = React.useState<T>(initial);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cacheKey = `rn:${key}`;

  React.useEffect(() => {
    let alive = true;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) setValueState({ ...initialRef.current, ...JSON.parse(raw) });
    } catch { /* ignore corrupt cache */ }
    setLoaded(true);
    if (!isSupabaseConfigured()) return;
    void (async () => {
      const { data } = await (await createClient()).from("user_settings").select("value").eq("key", key).maybeSingle();
      if (!alive || !data?.value || touched.current) return; // never overwrite edits made while loading
      const merged = { ...initialRef.current, ...(data.value as Partial<T>) };
      setValueState(merged);
      try { localStorage.setItem(cacheKey, JSON.stringify(merged)); } catch { /* storage full or blocked */ }
    })();
    return () => { alive = false; };
  }, [key, cacheKey]);

  const setValue = React.useCallback((v: T) => { touched.current = true; setValueState(v); }, []);

  /** Resolves true when the settings were stored. */
  const save = async (v: T): Promise<boolean> => {
    setError(null);
    try { localStorage.setItem(cacheKey, JSON.stringify(v)); } catch { /* cache only */ }
    if (!isSupabaseConfigured()) return true;
    const sb = await createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setError("Your session expired. Sign in again to save."); return false; }
    const { error: err } = await sb.from("user_settings").upsert({ user_id: session.user.id, key, value: v }, { onConflict: "user_id,key" });
    if (err) { setError("Could not save your settings. Try again."); return false; }
    return true;
  };

  return { value, setValue, save, loaded, error, defaults: initialRef.current };
}
