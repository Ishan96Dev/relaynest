import "server-only";
import { unstable_cache } from "next/cache";
import { PLANS, type PlanId } from "../../lib/billing/plans";
import { isSupabaseConfigured } from "../../lib/env/public";
import { createAdminClient } from "../../lib/supabase/admin";
import { BUCKETS, publicStorageUrl } from "../../lib/supabase/storage";
import { MEMBERSHIP_TAG, requireAuth } from "../auth/context";
import { getIdentity } from "../auth/identity";
import { getEntitlements } from "../billing/entitlements";

const lookupWorkspaceName = unstable_cache(
  async (workspaceId: string): Promise<string | null> => {
    const { data } = await createAdminClient().from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
    return data?.name ? String(data.name) : null;
  },
  ["workspace-name"],
  { revalidate: 60, tags: [MEMBERSHIP_TAG] },
);

export interface SessionUser {
  name: string;
  email: string;
  initials: string;
  /** Public URL of the uploaded profile picture, or null to show initials. */
  avatarUrl: string | null;
  planId: PlanId;
  plan: string;
  workspaceName: string;
  demo: boolean;
}

const DEMO: SessionUser = {
  name: "Ishan Chakraborty",
  email: "ishan@example.com",
  initials: "IC",
  avatarUrl: null,
  planId: "pro",
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
 * Current user for the UI chrome. Identity comes from the verified token; workspace plan comes from the 30 s
 * cached entitlements helper (invalidated immediately on payment, upgrade, or cancellation).
 */
export async function getSessionUser(): Promise<SessionUser> {
  if (!isSupabaseConfigured()) return DEMO;
  const identity = await getIdentity();
  if (!identity) return { ...DEMO, name: "Guest", email: "", initials: "?", avatarUrl: null, planId: "free", plan: "Free Plan", workspaceName: "My Workspace", demo: false };
  const name = identity.name || identity.email?.split("@")[0] || "User";

  let planId: PlanId = "free";
  let workspaceName = "My Workspace";
  try {
    const ctx = await requireAuth();
    const [ent, wsName] = await Promise.all([
      getEntitlements(ctx.workspaceId),
      lookupWorkspaceName(ctx.workspaceId),
    ]);
    planId = ent.planId;
    if (wsName) workspaceName = wsName;
  } catch {
    // Keep safe defaults if workspace lookup is unavailable during sign-out or cold boot.
  }

  return {
    name,
    email: identity.email ?? "",
    initials: initialsOf(name),
    avatarUrl: publicStorageUrl(BUCKETS.avatars, identity.avatarPath),
    planId,
    plan: `${PLANS[planId].name} Plan`,
    workspaceName,
    demo: false,
  };
}