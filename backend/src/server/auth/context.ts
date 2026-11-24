import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { ApiScope } from "../../lib/api/openapi";
import { sha256Hex } from "../../lib/crypto";
import { isSupabaseConfigured } from "../../lib/env/public";
import { ApiError, Errors } from "../../lib/http/api";
import { hasTrustedOrigin } from "../../lib/security/phishing";
import { createAdminClient } from "../../lib/supabase/admin";
import { logEvent } from "../logger";
import { enforceRateLimit, extractClientIp } from "../security/rate-limit";
import { getIdentity, getSupabase } from "./identity";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof getSupabase>>;
  userId: string;
  email: string | undefined;
  workspaceId: string;
  role: Role;
  apiKeyId?: string;
}

const WRITE_ROLES: Role[] = ["owner", "admin"];
export const MEMBERSHIP_TAG = "membership";
/**
 * Workspace and role of a user, cached on the server for 60 s so most navigations skip this database round trip.
 * The key is the user ID from the verified JWT, never client input, so the privileged read cannot be steered.
 * A missing membership throws, which keeps "no workspace yet" from being cached.
 * Tradeoff: a role change can take up to 60 s to show in the UI. Browser-side writes are still enforced by RLS on the
 * current role; call revalidateTag(MEMBERSHIP_TAG) from any code that changes members or roles.
 */
const lookupMembership = unstable_cache(
  async (userId: string, email: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workspace_members").select("workspace_id, role").eq("user_id", userId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(`membership-lookup: ${error.message}`);
    if (!data) {
      // Users created before the signup trigger existed (or when it failed) have no workspace; create one.
      const nm = email.split("@")[0] || "My";
      await admin.from("profiles").upsert({ id: userId, display_name: nm }, { onConflict: "id", ignoreDuplicates: true });
      const slug = `${nm.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
      const ws = await admin.from("workspaces").insert({ name: `${nm}'s Workspace`, slug, created_by: userId }).select("id").single();
      if (ws.error) throw new Error(`workspace-create: ${ws.error.message}`);
      const mem = await admin.from("workspace_members").insert({ workspace_id: ws.data.id, user_id: userId, role: "owner" });
      if (mem.error) throw new Error(`member-create: ${mem.error.message}`);
      return { workspaceId: ws.data.id as string, role: "owner" as Role };
    }
    return { workspaceId: data.workspace_id as string, role: data.role as Role };
  },
  ["workspace-membership"],
  { revalidate: 60, tags: [MEMBERSHIP_TAG] },
);

/**
 * Resolves the caller and their workspace. Identity comes from the verified JWT (no network); the workspace
 * and role come from one membership lookup (cached, see lookupMembership). The browser never supplies the workspace ID.
 * Memoized per request, so a layout, a page and its data helpers share one lookup.
 */
export const requireAuth = cache(async (): Promise<AuthContext> => {
  if (!isSupabaseConfigured()) throw Errors.notConfigured();
  const [identity, supabase] = await Promise.all([getIdentity(), getSupabase()]);
  if (!identity) throw Errors.unauthenticated();

  const membership = await lookupMembership(identity.id, identity.email ?? "").catch((e) => { console.error("[auth] membership failed:", e); return null; });
  if (!membership) throw Errors.forbidden();
  return { supabase, userId: identity.id, email: identity.email, workspaceId: membership.workspaceId, role: membership.role };
});
export function requireWrite(ctx: AuthContext) {
  if (!WRITE_ROLES.includes(ctx.role)) throw Errors.forbidden();
}

function extractPresentedApiKey(req: Request): string | null {
  const bearer = /^Bearer\s+(rnk_(?:live|test)_[A-Za-z0-9_-]{12,})$/i.exec(req.headers.get("authorization") ?? "");
  if (bearer?.[1]) return bearer[1];
  const header = req.headers.get("x-relaynest-api-key")?.trim();
  if (header && /^rnk_(?:live|test)_[A-Za-z0-9_-]{12,}$/i.test(header)) return header;
  return null;
}

/**
 * Authenticates via either a scoped Workspace API Key (`Authorization: Bearer rnk_...` / `X-RelayNest-API-Key`)
 * or a Supabase user browser session. Used by REST endpoints exposed in Swagger UI (/api-reference).
 */
export async function requireApiAccess(req: Request, requiredScope?: ApiScope): Promise<AuthContext> {
  if (!isSupabaseConfigured()) throw Errors.notConfigured();
  const token = extractPresentedApiKey(req);
  if (!token) return requireAuth();

  const admin = createAdminClient();
  const keyHash = await sha256Hex(token);
  const { data: keyRow, error } = await admin
    .from("api_keys")
    .select("id, workspace_id, scopes, status, expires_at, created_by")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !keyRow) {
    logEvent("auth", "warn", `Rejected invalid API key token from ${extractClientIp(req)}`);
    throw Errors.unauthenticated();
  }
  if (keyRow.status !== "active") {
    logEvent("auth", "warn", `Attempted use of revoked API key (${keyRow.id as string})`);
    throw new ApiError(401, "API_KEY_REVOKED", "This API key has been revoked.");
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at as string).getTime() <= Date.now()) {
    throw new ApiError(401, "API_KEY_EXPIRED", "This API key has expired.");
  }
  const scopes = (keyRow.scopes as string[] | null) ?? [];
  if (requiredScope && !scopes.includes(requiredScope)) {
    logEvent("auth", "warn", `API key ${keyRow.id as string} blocked by scope guard (needed ${requiredScope})`);
    throw new ApiError(403, "INSUFFICIENT_SCOPE", `API key is missing required scope "${requiredScope}".`);
  }

  let ownerUserId = (keyRow.created_by as string | null) ?? "";
  if (!ownerUserId) {
    const { data: owner } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", keyRow.workspace_id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    ownerUserId = (owner?.user_id as string | undefined) ?? "";
  }

  return {
    supabase: admin as unknown as AuthContext["supabase"],
    userId: ownerUserId,
    email: undefined,
    workspaceId: keyRow.workspace_id as string,
    role: "owner",
    apiKeyId: keyRow.id as string,
  };
}

/** Records API key usage timestamp, counter increment, and request log entry without failing the caller. */
export async function recordApiAccessTelemetry(
  req: Request,
  ctx: AuthContext,
  statusCode: number,
  startedAtMs: number,
): Promise<void> {
  if (!ctx.apiKeyId) return;
  try {
    const admin = createAdminClient();
    const path = (() => { try { return new URL(req.url).pathname; } catch { return req.url; } })();
    const latencyMs = Math.max(0, Math.round(Date.now() - startedAtMs));
    await Promise.all([
      admin.rpc("touch_api_key_usage", { p_key_id: ctx.apiKeyId }),
      admin.from("api_request_logs").insert({
        workspace_id: ctx.workspaceId,
        api_key_id: ctx.apiKeyId,
        method: req.method,
        path,
        status_code: statusCode,
        latency_ms: latencyMs,
      }),
    ]);
  } catch (e) {
    console.error("[api-telemetry] record failed:", e instanceof Error ? e.message : e);
  }
}

/** Shared wrapper for dual-auth REST endpoints (browser session or Bearer API key) with rate limiting & telemetry. */
export async function withApiAccess(
  req: Request,
  requiredScope: ApiScope | undefined,
  run: (ctx: AuthContext) => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  const ctx = await requireApiAccess(req, requiredScope);

  // Enforce same-origin check on cookie-authenticated mutations against cross-site request forgery
  if (!ctx.apiKeyId && isMutation && !hasTrustedOrigin(req)) {
    logEvent("auth", "error", `Blocked cross-origin mutation attempt (${req.method} ${req.url})`);
    throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site state-changing request blocked.");
  }

  const rlKey = ctx.apiKeyId ? `api:${ctx.apiKeyId}` : `ws:${ctx.workspaceId}:${extractClientIp(req)}`;
  const rlLimit = isMutation ? 45 : 120;
  const rl = await enforceRateLimit(rlKey, rlLimit, 60_000);

  try {
    const res = await run(ctx);
    res.headers.set("X-RateLimit-Limit", String(rl.limit));
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    await recordApiAccessTelemetry(req, ctx, res.status, started);
    return res;
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    await recordApiAccessTelemetry(req, ctx, status, started);
    throw err;
  }
}