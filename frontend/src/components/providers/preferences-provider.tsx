"use client";

import * as React from "react";
import {
  DEFAULT_PREFERENCES,
  localeForLanguage,
  parsePreferences,
  type ThemeChoice,
  type UserPreferences,
  type UserPreferencesPatch,
} from "@backend/lib/preferences";
import { api } from "@/lib/api-client";
import { applyTheme } from "@/lib/theme";

const PREFS_CACHE_KEY = "rn:preferences";

/** Applies every document-level visual, density, language, and accessibility flag onto <html>. */
export function applyPreferenceDomFlags(prefs: UserPreferences) {
  if (typeof document === "undefined") return;
  applyTheme(prefs.theme);
  const root = document.documentElement;
  root.classList.toggle("reduce-motion", prefs.reduceMotion);
  root.classList.toggle("high-contrast", prefs.highContrast);
  root.classList.toggle("compact-ui", prefs.compact);
  root.classList.toggle("hide-key-hints", !prefs.keyHints);
  root.dataset.density = prefs.density;
  root.lang = localeForLanguage(prefs.language);
}

function writeCache(prefs: UserPreferences) {
  try {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs));
    localStorage.setItem("rn-theme", prefs.theme);
  } catch {
    // storage full or blocked
  }
}

export interface PreferencesContextValue {
  prefs: UserPreferences;
  updatedAt: string | null;
  demo: boolean;
  saving: boolean;
  /** Saves a full or partial preferences update to Supabase (and local cache). */
  savePreferences: (patch: UserPreferencesPatch) => Promise<{ ok: true; preferences: UserPreferences } | { ok: false; message: string }>;
  /** Convenience helper for instant theme toggles (Header & Settings). */
  setThemeAndSync: (theme: ThemeChoice) => Promise<void>;
  /** Resets all preferences back to defaults in Supabase (and local cache). */
  resetPreferences: () => Promise<{ ok: true; preferences: UserPreferences } | { ok: false; message: string }>;
  /** Temporarily previews DOM flags while editing inside Settings -> Preferences. */
  previewDomFlags: (draft: UserPreferences) => void;
}

const PreferencesContext = React.createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  initial,
  initialUpdatedAt = null,
  demo = false,
  children,
}: {
  initial: UserPreferences;
  initialUpdatedAt?: string | null;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = React.useState<UserPreferences>(() => parsePreferences(initial));
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(initialUpdatedAt);
  const [saving, setSaving] = React.useState(false);

  // Sync SSR-hydrated Supabase preferences onto <html> and localStorage cache immediately.
  React.useEffect(() => {
    if (demo) {
      // In demo mode without Supabase, honor any saved browser-local preferences.
      try {
        const raw = localStorage.getItem(PREFS_CACHE_KEY);
        if (raw) {
          const local = parsePreferences(JSON.parse(raw));
          setPrefs(local);
          applyPreferenceDomFlags(local);
          return;
        }
      } catch {
        // ignore corrupt cache
      }
    }
    applyPreferenceDomFlags(prefs);
    writeCache(prefs);
  }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply DOM flags & cache whenever committed prefs change.
  React.useEffect(() => {
    applyPreferenceDomFlags(prefs);
    writeCache(prefs);
  }, [prefs]);

  // Listen to OS color-scheme changes dynamically when Theme is set to "system".
  React.useEffect(() => {
    if (prefs.theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.theme]);

  const savePreferences = React.useCallback(
    async (patch: UserPreferencesPatch) => {
      const optimistic = parsePreferences({ ...prefs, ...patch });
      setPrefs(optimistic);
      applyPreferenceDomFlags(optimistic);
      writeCache(optimistic);

      if (demo) {
        const now = new Date().toISOString();
        setUpdatedAt(now);
        return { ok: true as const, preferences: optimistic };
      }

      setSaving(true);
      const res = await api<{ preferences: UserPreferences; updatedAt: string | null }>("/api/v1/settings/preferences", {
        method: "PUT",
        body: patch,
      });
      setSaving(false);

      if (!res.ok) {
        // Roll back to previous committed prefs on server failure.
        setPrefs(prefs);
        applyPreferenceDomFlags(prefs);
        return { ok: false as const, message: res.message };
      }

      const saved = parsePreferences(res.data.preferences);
      setPrefs(saved);
      setUpdatedAt(res.data.updatedAt ?? new Date().toISOString());
      applyPreferenceDomFlags(saved);
      writeCache(saved);
      return { ok: true as const, preferences: saved };
    },
    [prefs, demo],
  );

  const setThemeAndSync = React.useCallback(
    async (theme: ThemeChoice) => {
      await savePreferences({ theme });
    },
    [savePreferences],
  );

  const resetPreferences = React.useCallback(async () => {
    const defaults = { ...DEFAULT_PREFERENCES };
    setPrefs(defaults);
    applyPreferenceDomFlags(defaults);
    writeCache(defaults);

    if (demo) {
      setUpdatedAt(new Date().toISOString());
      return { ok: true as const, preferences: defaults };
    }

    setSaving(true);
    const res = await api<{ preferences: UserPreferences; updatedAt: string | null }>("/api/v1/settings/preferences", {
      method: "DELETE",
    });
    setSaving(false);

    if (!res.ok) {
      setPrefs(prefs);
      applyPreferenceDomFlags(prefs);
      return { ok: false as const, message: res.message };
    }

    const saved = parsePreferences(res.data.preferences);
    setPrefs(saved);
    setUpdatedAt(res.data.updatedAt ?? new Date().toISOString());
    applyPreferenceDomFlags(saved);
    writeCache(saved);
    return { ok: true as const, preferences: saved };
  }, [prefs, demo]);

  const previewDomFlags = React.useCallback((draft: UserPreferences) => {
    applyPreferenceDomFlags(draft);
  }, []);

  const ctx = React.useMemo<PreferencesContextValue>(
    () => ({ prefs, updatedAt, demo, saving, savePreferences, setThemeAndSync, resetPreferences, previewDomFlags }),
    [prefs, updatedAt, demo, saving, savePreferences, setThemeAndSync, resetPreferences, previewDomFlags],
  );

  return <PreferencesContext.Provider value={ctx}>{children}</PreferencesContext.Provider>;
}

/** Reads the user's Supabase-synced preferences anywhere inside the authenticated workspace (safe outside provider too). */
export function usePreferences(): PreferencesContextValue {
  const ctx = React.useContext(PreferencesContext);
  if (ctx) return ctx;
  return {
    prefs: DEFAULT_PREFERENCES,
    updatedAt: null,
    demo: true,
    saving: false,
    savePreferences: async (patch) => ({ ok: true, preferences: parsePreferences({ ...DEFAULT_PREFERENCES, ...patch }) }),
    setThemeAndSync: async (theme) => { applyTheme(theme); },
    resetPreferences: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
    previewDomFlags: applyPreferenceDomFlags,
  };
}
