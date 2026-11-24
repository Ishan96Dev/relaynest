import "server-only";
import { isSupabaseConfigured } from "../../lib/env/public";
import { BUCKETS, publicStorageUrl } from "../../lib/supabase/storage";
import { getIdentity } from "../auth/identity";

export interface SessionUser {
  name: string;
  email: string;
  initials: string;
  /** Public URL of the uploaded profile picture, or null to show initials. */
  avatarUrl: string | null;
  plan: string;
  workspaceName: string;
  demo: boolean;
}

const DEMO: SessionUser = {
  name: "Ishan Chakraborty",
  email: "ishan@example.com",
  initials: "IC",
  avatarUrl: null,
  plan: "Pro Plan",
  workspaceName: "RelayNest Team",
  demo: true,
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Current user for the UI chrome. Reads only the verified token (no database or network call), so the layout adds
 * no latency to navigation. The display name comes from the `full_name` set at sign-up and kept in sync on profile save.
 */
export async function getSessionUser(): Promise<SessionUser> {
  if (!isSupabaseConfigured()) return DEMO;
  const identity = await getIdentity();
  if (!identity) return { ...DEMO, name: "Guest", email: "", initials: "?", avatarUrl: null, plan: "Free Plan", demo: false };
  const name = identity.name || identity.email?.split("@")[0] || "User";
  return { name, email: identity.email ?? "", initials: initialsOf(name), avatarUrl: publicStorageUrl(BUCKETS.avatars, identity.avatarPath), plan: "Free Plan", workspaceName: "My Workspace", demo: false };
}