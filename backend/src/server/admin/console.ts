import "server-only";
import { aiKeys } from "@backend/lib/env/ai";
import { brevoEnv, cronSecret, razorpayEnv } from "@backend/lib/env/integrations";
import { publicEnv } from "@backend/lib/env/public";
import { serverEnv } from "@backend/lib/env/server";
import { milvusConfig } from "@backend/lib/env/vector";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { redisBackendKind, redisPing } from "@backend/server/cache/redis";
import { probeBrevoHealth } from "@backend/server/email/mailer";
import { clearConsoleLogs, getConsoleLogs, logEvent, type ConsoleLogEntry, type LogLevel, type LogSection } from "@backend/server/logger";
import { kafkaPing, queueBackendKind } from "@backend/server/queue/kafka";
import { isDistributedRateLimitActive } from "@backend/server/security/rate-limit";

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  provider: string;
  createdAt: string;
  lastSignInAt: string | null;
  workspaceName: string | null;
  role: string | null;
  plan: string;
  botsCount: number;
  aiAgentsCount: number;
  apiKeysCount: number;
  integrationsCount: number;
}

export interface AuditMovement {
  id: string;
  ts: string;
  category: "user_event" | "activity" | "execution" | "payment" | "ai" | "notification" | "api_key" | "integration" | "security";
  actor: string;
  workspace: string;
  action: string;
  detail: string;
}

export interface AdminAuditTotals {
  users: number;
  workspaces: number;
  bots: number;
  aiAgents: number;
  apiKeys: number;
  integrations: number;
  securityAlerts: number;
}

export interface AdminAuditData {
  totals: AdminAuditTotals;
  users: AdminUserRecord[];
  movements: AuditMovement[];
}

export interface AdminKeyInventoryItem {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  workspaceName: string;
  scopes: string[];
  status: string;
  requestCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminPlatformCredentialItem {
  envKey: string;
  label: string;
  group: string;
  configured: boolean;
  maskedPreview: string | null;
  note: string;
}

export interface AdminSecurityControl {
  id: string;
  title: string;
  category: string;
  status: "enforced" | "advisory";
  detail: string;
}

export interface AdminSecurityWarningItem {
  id: string;
  ts: string;
  severity: "critical" | "warning" | "info";
  source: string;
  title: string;
  detail: string;
  actor?: string;
}

const ADMIN_CACHE_TTL_MS = 15_000;
const adminCache = new Map<string, { at: number; value: unknown }>();

async function cachedAdmin<T>(key: string, fresh: boolean, loader: () => Promise<T>): Promise<T> {
  if (!fresh) {
    const hit = adminCache.get(key);
    if (hit && Date.now() - hit.at < ADMIN_CACHE_TTL_MS) return hit.value as T;
  }
  const value = await loader();
  adminCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Executes async query factories with bounded concurrency (default 4) so Cloudflare Workers
 * never exceed their 6-simultaneous-outgoing-connection runtime cap or spike isolate CPU.
 */
async function runBatched<T>(tasks: Array<() => Promise<T>>, concurrency = 4): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      results[idx] = await tasks[idx]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function buildUserRecords(
  users: Array<{
    id: string;
    email?: string;
    created_at: string;
    last_sign_in_at?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  }>,
  profilesRows: Array<Record<string, unknown>>,
  membersRows: Array<Record<string, unknown>>,
  workspacesRows: Array<Record<string, unknown>>,
  subsRows: Array<Record<string, unknown>>,
  botsRows: Array<Record<string, unknown>>,
  agentsRows: Array<Record<string, unknown>>,
  apiKeysRows: Array<Record<string, unknown>>,
  intRows: Array<Record<string, unknown>>,
): {
  userRecords: AdminUserRecord[];
  workspaces: Map<string, string>;
  userEmail: Map<string, string>;
} {
  const profiles = new Map(profilesRows.map((p) => [p.id as string, (p.full_name as string | null) ?? ""]));
  const workspaces = new Map(workspacesRows.map((w) => [w.id as string, (w.name as string) ?? "Workspace"]));
  const subs = new Map(subsRows.map((s) => [s.workspace_id as string, String(s.plan)]));
  const userEmail = new Map(users.map((u) => [u.id, u.email ?? u.id]));

  const memberByUser = new Map<string, { workspaceId: string; role: string }>();
  for (const m of membersRows) {
    if (!memberByUser.has(m.user_id as string)) {
      memberByUser.set(m.user_id as string, { workspaceId: m.workspace_id as string, role: m.role as string });
    }
  }

  const botsByWs = new Map<string, number>();
  for (const b of botsRows) botsByWs.set(b.workspace_id as string, (botsByWs.get(b.workspace_id as string) ?? 0) + 1);
  const agentsByWs = new Map<string, number>();
  for (const a of agentsRows) agentsByWs.set(a.workspace_id as string, (agentsByWs.get(a.workspace_id as string) ?? 0) + 1);
  const keysByWs = new Map<string, number>();
  for (const k of apiKeysRows) keysByWs.set(k.workspace_id as string, (keysByWs.get(k.workspace_id as string) ?? 0) + 1);
  const intByWs = new Map<string, number>();
  for (const i of intRows) intByWs.set(i.workspace_id as string, (intByWs.get(i.workspace_id as string) ?? 0) + 1);

  const userRecords: AdminUserRecord[] = users.map((u) => {
    const m = memberByUser.get(u.id);
    const wsId = m?.workspaceId;
    return {
      id: u.id,
      email: u.email ?? "-",
      name: profiles.get(u.id) || (u.user_metadata?.full_name as string) || "-",
      provider: (u.app_metadata?.provider as string) || "email",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      workspaceName: wsId ? workspaces.get(wsId) ?? null : null,
      role: m?.role ?? null,
      plan: wsId ? subs.get(wsId) ?? "free" : "free",
      botsCount: wsId ? botsByWs.get(wsId) ?? 0 : 0,
      aiAgentsCount: wsId ? agentsByWs.get(wsId) ?? 0 : 0,
      apiKeysCount: wsId ? keysByWs.get(wsId) ?? 0 : 0,
      integrationsCount: wsId ? intByWs.get(wsId) ?? 0 : 0,
    };
  });

  return { userRecords, workspaces, userEmail };
}

/**
 * Lightweight summary loader for `/admin` Overview.
 * Uses HEAD counts and tight slices instead of scanning 16 tables at once.
 */
export async function getAdminOverviewData(fresh = false): Promise<AdminAuditData> {
  return cachedAdmin("overview", fresh, async () => {
    const db = createAdminClient();
    const [
      usersRes,
      wsRes,
      botsRes,
      agentsRes,
      apiKeysRes,
      intRes,
      profilesRes,
      membersRes,
      subsRes,
      auditRes,
      logsRes,
      apiErrRes,
    ] = await runBatched<unknown>([
      () => db.auth.admin.listUsers({ page: 1, perPage: 50 }),
      async () => db.from("workspaces").select("id, name", { count: "exact" }).limit(100),
      async () => db.from("bots").select("workspace_id", { count: "exact" }).limit(200),
      async () => db.from("ai_agents").select("workspace_id", { count: "exact" }).limit(200),
      async () => db.from("api_keys").select("workspace_id", { count: "exact" }).limit(200),
      async () => db.from("integrations").select("workspace_id", { count: "exact" }).limit(200),
      async () => db.from("profiles").select("id, full_name").limit(100),
      async () => db.from("workspace_members").select("workspace_id, user_id, role").limit(150),
      async () => db.from("subscriptions").select("workspace_id, plan, status").limit(100),
      async () => db.from("user_audit_logs").select("id, user_id, user_email, workspace_id, event, page_path, detail, ip, created_at").order("created_at", { ascending: false }).limit(25),
      async () => db.from("activity_logs").select("id, workspace_id, actor_id, action, detail, created_at").order("created_at", { ascending: false }).limit(15),
      async () => db.from("api_request_logs").select("id, workspace_id, method, path, status_code, latency_ms, created_at").gte("status_code", 400).order("created_at", { ascending: false }).limit(15),
    ], 4);

    type QRes = { data?: Array<Record<string, unknown>> | null; count?: number | null };
    const uRes = usersRes as { data?: { users?: Array<{ id: string; email?: string; created_at: string; last_sign_in_at?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }>; total?: number } };
    const ws = wsRes as QRes;
    const bots = botsRes as QRes;
    const agents = agentsRes as QRes;
    const apiKeys = apiKeysRes as QRes;
    const intg = intRes as QRes;
    const profiles = profilesRes as QRes;
    const members = membersRes as QRes;
    const subs = subsRes as QRes;
    const audit = auditRes as QRes;
    const logs = logsRes as QRes;
    const apiErr = apiErrRes as QRes;

    const users = uRes.data?.users ?? [];
    const { userRecords, workspaces, userEmail } = buildUserRecords(
      users,
      profiles.data ?? [],
      members.data ?? [],
      ws.data ?? [],
      subs.data ?? [],
      bots.data ?? [],
      agents.data ?? [],
      apiKeys.data ?? [],
      intg.data ?? [],
    );

    const movements: AuditMovement[] = [
      ...(audit.data ?? []).map((u) => {
        const ev = String(u.event);
        return {
          id: `aud-${u.id}`,
          ts: u.created_at as string,
          category: (ev.startsWith("security.") ? "security" : "user_event") as AuditMovement["category"],
          actor: (u.user_email as string | null) ?? (u.user_id ? userEmail.get(u.user_id as string) ?? String(u.user_id) : "anon"),
          workspace: u.workspace_id ? workspaces.get(u.workspace_id as string) ?? "-" : "-",
          action: ev,
          detail: [u.page_path, u.detail, u.ip ? `ip:${u.ip}` : null].filter(Boolean).join(" · "),
        };
      }),
      ...(logs.data ?? []).map((l) => {
        const act = String(l.action);
        const cat: AuditMovement["category"] = act.startsWith("api_key.") ? "api_key" : act.startsWith("integration.") || act.startsWith("webhook.") ? "integration" : "activity";
        return {
          id: `act-${l.id}`,
          ts: l.created_at as string,
          category: cat,
          actor: l.actor_id ? userEmail.get(l.actor_id as string) ?? String(l.actor_id) : "system",
          workspace: workspaces.get(l.workspace_id as string) ?? "-",
          action: act,
          detail: String(l.detail ?? ""),
        };
      }),
      ...(apiErr.data ?? []).map((r) => ({
        id: `apilog-${r.id}`,
        ts: r.created_at as string,
        category: "api_key" as const,
        actor: "API Key Bearer",
        workspace: workspaces.get(r.workspace_id as string) ?? "-",
        action: `${r.method} ${r.path}`,
        detail: `HTTP ${r.status_code} · ${r.latency_ms ?? 0}ms`,
      })),
    ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

    const securityAlerts = movements.filter(
      (m) => m.category === "security" || m.action.includes("failed") || m.detail.includes("HTTP 4") || m.detail.includes("HTTP 5"),
    ).length;

    return {
      totals: {
        users: uRes.data?.total ?? userRecords.length,
        workspaces: ws.count ?? ws.data?.length ?? 0,
        bots: bots.count ?? bots.data?.length ?? 0,
        aiAgents: agents.count ?? agents.data?.length ?? 0,
        apiKeys: apiKeys.count ?? apiKeys.data?.length ?? 0,
        integrations: intg.count ?? intg.data?.length ?? 0,
        securityAlerts,
      },
      users: userRecords.slice(0, 8),
      movements: movements.slice(0, 12),
    };
  });
}

/** Focused user directory loader for `/admin/users` (skips all log/event tables). */
export async function getAdminUsersData(fresh = false): Promise<{ users: AdminUserRecord[] }> {
  return cachedAdmin("users", fresh, async () => {
    const db = createAdminClient();
    const [usersRes, profilesRes, membersRes, wsRes, subsRes, botsRes, agentsRes, apiKeysRes, intRes] = await runBatched<unknown>([
      () => db.auth.admin.listUsers({ page: 1, perPage: 150 }),
      async () => db.from("profiles").select("id, full_name").limit(200),
      async () => db.from("workspace_members").select("workspace_id, user_id, role").limit(250),
      async () => db.from("workspaces").select("id, name").limit(200),
      async () => db.from("subscriptions").select("workspace_id, plan, status").limit(200),
      async () => db.from("bots").select("workspace_id").limit(300),
      async () => db.from("ai_agents").select("workspace_id").limit(300),
      async () => db.from("api_keys").select("workspace_id").limit(300),
      async () => db.from("integrations").select("workspace_id").limit(300),
    ], 4);

    type QRes = { data?: Array<Record<string, unknown>> | null };
    const uRes = usersRes as { data?: { users?: Array<{ id: string; email?: string; created_at: string; last_sign_in_at?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }> } };
    const { userRecords } = buildUserRecords(
      uRes.data?.users ?? [],
      (profilesRes as QRes).data ?? [],
      (membersRes as QRes).data ?? [],
      (wsRes as QRes).data ?? [],
      (subsRes as QRes).data ?? [],
      (botsRes as QRes).data ?? [],
      (agentsRes as QRes).data ?? [],
      (apiKeysRes as QRes).data ?? [],
      (intRes as QRes).data ?? [],
    );

    return { users: userRecords };
  });
}

export async function getAdminAuditData(fresh = false): Promise<AdminAuditData> {
  return cachedAdmin("audit", fresh, async () => {
    const db = createAdminClient();
    const [
      usersRes, profilesRes, membersRes, wsRes, subsRes, botsRes, agentsRes,
      logsRes, execRes, payRes, aiRes, notifRes, auditRes, apiKeysRes, intRes, apiLogsRes,
    ] = await runBatched<unknown>([
      () => db.auth.admin.listUsers({ page: 1, perPage: 120 }),
      async () => db.from("profiles").select("id, full_name").limit(200),
      async () => db.from("workspace_members").select("workspace_id, user_id, role").limit(250),
      async () => db.from("workspaces").select("id, name, created_by").limit(200),
      async () => db.from("subscriptions").select("workspace_id, plan, status").limit(200),
      async () => db.from("bots").select("id, workspace_id").limit(300),
      async () => db.from("ai_agents").select("id, workspace_id").limit(300),
      async () => db.from("activity_logs").select("id, workspace_id, actor_id, action, detail, created_at").order("created_at", { ascending: false }).limit(60),
      async () => db.from("executions").select("id, workspace_id, trigger_type, status, duration_ms, started_at").order("started_at", { ascending: false }).limit(35),
      async () => db.from("payments").select("id, workspace_id, plan, amount, currency, status, method, created_at").order("created_at", { ascending: false }).limit(30),
      async () => db.from("ai_usage_events").select("id, workspace_id, user_id, source, model_slug, origin, total_tokens, cost_usd, created_at").order("created_at", { ascending: false }).limit(35),
      async () => db.from("notifications").select("id, workspace_id, user_id, kind, title, created_at").order("created_at", { ascending: false }).limit(35),
      async () => db.from("user_audit_logs").select("id, user_id, user_email, workspace_id, event, page_path, detail, ip, created_at").order("created_at", { ascending: false }).limit(80),
      async () => db.from("api_keys").select("id, workspace_id").order("created_at", { ascending: false }).limit(150),
      async () => db.from("integrations").select("id, workspace_id").order("created_at", { ascending: false }).limit(150),
      async () => db.from("api_request_logs").select("id, workspace_id, method, path, status_code, latency_ms, created_at").order("created_at", { ascending: false }).limit(35),
    ], 4);

    type QRes = { data?: Array<Record<string, unknown>> | null };
    const uRes = usersRes as { data?: { users?: Array<{ id: string; email?: string; created_at: string; last_sign_in_at?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }> } };
    const wsData = (wsRes as QRes).data ?? [];
    const botsData = (botsRes as QRes).data ?? [];
    const agentsData = (agentsRes as QRes).data ?? [];
    const apiKeysData = (apiKeysRes as QRes).data ?? [];
    const intData = (intRes as QRes).data ?? [];

    const { userRecords, workspaces, userEmail } = buildUserRecords(
      uRes.data?.users ?? [],
      (profilesRes as QRes).data ?? [],
      (membersRes as QRes).data ?? [],
      wsData,
      (subsRes as QRes).data ?? [],
      botsData,
      agentsData,
      apiKeysData,
      intData,
    );

    const movements: AuditMovement[] = [
      ...((auditRes as QRes).data ?? []).map((u) => {
        const ev = String(u.event);
        return {
          id: `aud-${u.id}`,
          ts: u.created_at as string,
          category: (ev.startsWith("security.") ? "security" : "user_event") as AuditMovement["category"],
          actor: (u.user_email as string | null) ?? (u.user_id ? userEmail.get(u.user_id as string) ?? String(u.user_id) : "anon"),
          workspace: u.workspace_id ? workspaces.get(u.workspace_id as string) ?? "-" : "-",
          action: ev,
          detail: [u.page_path, u.detail, u.ip ? `ip:${u.ip}` : null].filter(Boolean).join(" · "),
        };
      }),
      ...((logsRes as QRes).data ?? []).map((l) => {
        const act = String(l.action);
        const cat: AuditMovement["category"] = act.startsWith("api_key.") ? "api_key" : act.startsWith("integration.") || act.startsWith("webhook.") ? "integration" : "activity";
        return {
          id: `act-${l.id}`,
          ts: l.created_at as string,
          category: cat,
          actor: l.actor_id ? userEmail.get(l.actor_id as string) ?? String(l.actor_id) : "system",
          workspace: workspaces.get(l.workspace_id as string) ?? "-",
          action: act,
          detail: String(l.detail ?? ""),
        };
      }),
      ...((apiLogsRes as QRes).data ?? []).map((r) => ({
        id: `apilog-${r.id}`,
        ts: r.created_at as string,
        category: "api_key" as const,
        actor: "API Key Bearer",
        workspace: workspaces.get(r.workspace_id as string) ?? "-",
        action: `${r.method} ${r.path}`,
        detail: `HTTP ${r.status_code} · ${r.latency_ms ?? 0}ms`,
      })),
      ...((execRes as QRes).data ?? []).map((e) => ({
        id: `ex-${e.id}`,
        ts: e.started_at as string,
        category: "execution" as const,
        actor: "bot/workflow",
        workspace: workspaces.get(e.workspace_id as string) ?? "-",
        action: `execution.${e.status}`,
        detail: `${e.trigger_type}${e.duration_ms ? ` (${e.duration_ms} ms)` : ""}`,
      })),
      ...((payRes as QRes).data ?? []).map((p) => ({
        id: `pay-${p.id}`,
        ts: p.created_at as string,
        category: "payment" as const,
        actor: "billing",
        workspace: workspaces.get(p.workspace_id as string) ?? "-",
        action: `payment.${p.status}`,
        detail: `${p.plan} · ${Number(p.amount) / 100} ${p.currency} (${p.method ?? "razorpay"})`,
      })),
      ...((aiRes as QRes).data ?? []).map((a) => ({
        id: `ai-${a.id}`,
        ts: a.created_at as string,
        category: "ai" as const,
        actor: a.user_id ? userEmail.get(a.user_id as string) ?? "-" : "bot",
        workspace: workspaces.get(a.workspace_id as string) ?? "-",
        action: `ai.${a.source}.${a.origin}`,
        detail: `${a.model_slug} · ${a.total_tokens} tokens`,
      })),
      ...((notifRes as QRes).data ?? []).map((n) => ({
        id: `not-${n.id}`,
        ts: n.created_at as string,
        category: "notification" as const,
        actor: n.user_id ? userEmail.get(n.user_id as string) ?? "-" : "workspace",
        workspace: workspaces.get(n.workspace_id as string) ?? "-",
        action: `notify.${n.kind}`,
        detail: String(n.title),
      })),
    ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 150);

    return {
      totals: {
        users: userRecords.length,
        workspaces: wsData.length,
        bots: botsData.length,
        aiAgents: agentsData.length,
        apiKeys: apiKeysData.length,
        integrations: intData.length,
        securityAlerts: movements.filter((m) => m.category === "security" || m.action.includes("failed") || m.detail.includes("HTTP 4") || m.detail.includes("HTTP 5")).length,
      },
      users: userRecords,
      movements,
    };
  });
}

export interface ServiceProbe {
  id: string;
  name: string;
  group: "core" | "database" | "ai" | "integrations";
  status: "up" | "down" | "unconfigured";
  latencyMs: number | null;
  detail: string;
  keyMask?: string;
}

const mask = (v?: string) => (v && v.length > 8 ? `${v.slice(0, 6)}••••${v.slice(-4)}` : v ? "••••" : undefined);

async function timedProbe(fn: () => Promise<{ ok: boolean; detail: string; status?: "up" | "down" | "unconfigured" }>): Promise<{ status: "up" | "down" | "unconfigured"; latencyMs: number; detail: string }> {
  const t = Date.now();
  try {
    const r = await fn();
    return { status: r.status ?? (r.ok ? "up" : "down"), latencyMs: Date.now() - t, detail: r.detail };
  } catch (e) {
    return { status: "down", latencyMs: Date.now() - t, detail: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function getAdminServicesHealth(): Promise<ServiceProbe[]> {
  const pub = publicEnv();
  const srv = serverEnv();
  const keys = aiKeys();
  const vec = milvusConfig();
  const rzp = razorpayEnv();
  const brv = brevoEnv();
  const db = createAdminClient();

  const [auth, database, storage, milvus, nvidia, vercel, telegram, brevo, redis, kafka] = await runBatched<unknown>([
    () => timedProbe(async () => {
      if (!pub.NEXT_PUBLIC_SUPABASE_URL || !pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return { ok: false, status: "unconfigured", detail: "Missing NEXT_PUBLIC_SUPABASE_URL" };
      const res = await fetch(`${pub.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(3500) });
      return { ok: res.ok, detail: res.ok ? `HTTP ${res.status} · GoTrue healthy` : `HTTP ${res.status}` };
    }),
    () => timedProbe(async () => {
      if (!pub.NEXT_PUBLIC_SUPABASE_URL) return { ok: false, status: "unconfigured", detail: "Missing Supabase config" };
      const { count, error } = await db.from("workspaces").select("id", { count: "exact", head: true });
      return error ? { ok: false, detail: error.message } : { ok: true, detail: `Connected · ${count ?? 0} workspaces` };
    }),
    () => timedProbe(async () => {
      if (!pub.NEXT_PUBLIC_SUPABASE_URL) return { ok: false, status: "unconfigured", detail: "Missing Supabase config" };
      const { data, error } = await db.storage.listBuckets();
      return error ? { ok: false, detail: error.message } : { ok: true, detail: `${data?.length ?? 0} buckets (${(data ?? []).map((b) => b.name).join(", ")})` };
    }),
    () => timedProbe(async () => {
      if (!vec) return { ok: false, status: "unconfigured", detail: "Keyword fallback active (set MILVUS_URI for vector search)" };
      const headers: Record<string, string> = { accept: "application/json" };
      if (vec.token) headers.authorization = `Bearer ${vec.token}`;
      const res = await fetch(`${vec.uri}/v2/vectordb/collections/list`, {
        method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(vec.dbName ? { dbName: vec.dbName } : {}), signal: AbortSignal.timeout(3500),
      }).catch(() => null);
      if (!res) return { ok: false, detail: `Unreachable at ${vec.uri}` };
      return { ok: res.ok, detail: res.ok ? `Reachable · collection ${vec.collection}` : `HTTP ${res.status}` };
    }),
    () => timedProbe(async () => {
      if (!keys.nvidia) return { ok: false, status: "unconfigured", detail: "NVIDIA_API_KEY not set" };
      const res = await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { authorization: `Bearer ${keys.nvidia}` }, signal: AbortSignal.timeout(4000) });
      return { ok: res.ok, detail: res.ok ? "API key valid · integrate.api.nvidia.com reachable" : `Rejected (HTTP ${res.status})` };
    }),
    () => timedProbe(async () => {
      if (!keys.gateway) return { ok: false, status: "unconfigured", detail: "AI_GATEWAY_API_KEY not set" };
      const res = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { authorization: `Bearer ${keys.gateway}` }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { ok: false, detail: `Rejected (HTTP ${res.status})` };
      const j = (await res.json()) as { balance?: string; total_used?: string };
      return { ok: true, detail: `Balance $${Number(j.balance ?? 0).toFixed(2)} · Used $${Number(j.total_used ?? 0).toFixed(2)}` };
    }),
    () => timedProbe(async () => {
      const res = await fetch(`${srv.TELEGRAM_API_BASE_URL}/`, { signal: AbortSignal.timeout(3500) });
      return { ok: res.status > 0 && res.status < 500, detail: `Reachable (${srv.TELEGRAM_API_BASE_URL})` };
    }),
    () => timedProbe(() => probeBrevoHealth()),
    () => redisPing(),
    () => kafkaPing(),
  ], 4);

  type ProbeRes = { status: "up" | "down" | "unconfigured"; latencyMs: number; detail: string };
  type PingRes = { ok: boolean; detail: string; latencyMs: number };
  const redisRes = redis as PingRes;
  const kafkaRes = kafka as PingRes;

  const probes: ServiceProbe[] = [
    { id: "frontend", name: "Frontend (Next.js App)", group: "core", status: "up", latencyMs: 1, detail: `Serving at ${pub.NEXT_PUBLIC_APP_URL}` },
    { id: "backend", name: "Backend API & Scheduler", group: "core", status: srv.ENCRYPTION_KEY ? "up" : "down", latencyMs: 1, detail: `Encryption ${srv.ENCRYPTION_KEY ? "ready" : "missing"} · Cron ${cronSecret() ? "protected" : "unset"}` },
    { id: "supabase_auth", name: "Supabase Auth", group: "database", ...(auth as ProbeRes), keyMask: mask(pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) },
    { id: "supabase_db", name: "Supabase PostgreSQL DB", group: "database", ...(database as ProbeRes), keyMask: mask(srv.SUPABASE_SECRET_KEY) },
    { id: "supabase_storage", name: "Supabase Storage", group: "database", ...(storage as ProbeRes) },
    { id: "milvus", name: "Milvus / Zilliz Vector DB", group: "database", ...(milvus as ProbeRes), keyMask: mask(vec?.token) },
    { id: "redis", name: "Redis Cache & Rate Limit", group: "database", status: redisRes.ok ? "up" : redisRes.detail.includes("In-memory") ? "unconfigured" : "down", latencyMs: redisRes.latencyMs, detail: redisRes.detail },
    { id: "kafka", name: "Kafka Event Bus", group: "database", status: kafkaRes.ok ? "up" : kafkaRes.detail.includes("Not set") ? "unconfigured" : "down", latencyMs: kafkaRes.latencyMs, detail: kafkaRes.detail },
    { id: "nvidia", name: "NVIDIA Build API", group: "ai", ...(nvidia as ProbeRes), keyMask: mask(keys.nvidia) },
    { id: "vercel_gateway", name: "Vercel AI Gateway", group: "ai", ...(vercel as ProbeRes), keyMask: mask(keys.gateway) },
    { id: "telegram", name: "Telegram Bot API", group: "integrations", ...(telegram as ProbeRes) },
    { id: "razorpay", name: "Razorpay Billing", group: "integrations", status: rzp.keyId && rzp.keySecret ? "up" : "unconfigured", latencyMs: null, detail: rzp.keyId ? `Mode: ${rzp.keyId.startsWith("rzp_live_") ? "Live" : "Test"} · Webhook ${rzp.webhookSecret ? "signed" : "missing"}` : "RAZORPAY_KEY_ID not set", keyMask: mask(rzp.keyId) },
    { id: "brevo", name: "Brevo Email API", group: "integrations", ...(brevo as ProbeRes), keyMask: mask(brv.apiKey) },
    { id: "ga4", name: "Google Analytics 4", group: "integrations", status: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? "up" : "unconfigured", latencyMs: null, detail: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "NEXT_PUBLIC_GA_MEASUREMENT_ID not set" },
  ];

  logEvent("backend", "info", "Admin inspected services health", { up: probes.filter((p) => p.status === "up").length, total: probes.length });
  return probes;
}

export async function getAdminLogsData(section: string = "all", level: string = "all") {
  const live = getConsoleLogs(section, level);
  const db = createAdminClient();
  const [aiRes, actRes, kbRes] = await Promise.all([
    db.from("ai_usage_events").select("id, source, model_slug, origin, total_tokens, latency_ms, cost_usd, created_at").order("created_at", { ascending: false }).limit(35),
    db.from("activity_logs").select("id, action, detail, created_at").order("created_at", { ascending: false }).limit(35),
    db.from("kb_documents").select("id, name, status, chunk_count, error_message, updated_at").order("updated_at", { ascending: false }).limit(25),
  ]);

  const persisted: ConsoleLogEntry[] = [
    ...(aiRes.data ?? []).map((r) => ({
      id: `db-llm-${r.id}`,
      ts: r.created_at as string,
      section: "llm" as LogSection,
      level: "info" as LogLevel,
      message: `${r.source} ${r.model_slug} (${r.origin}) · ${r.total_tokens} tok · ${r.latency_ms ?? 0} ms`,
      meta: { costUsd: r.cost_usd },
    })),
    ...(actRes.data ?? []).map((r) => ({
      id: `db-act-${r.id}`,
      ts: r.created_at as string,
      section: (String(r.action).startsWith("auth") ? "auth" : "db") as LogSection,
      level: "info" as LogLevel,
      message: `${r.action}${r.detail ? `: ${r.detail}` : ""}`,
    })),
    ...(kbRes.data ?? []).map((r) => ({
      id: `db-vec-${r.id}`,
      ts: r.updated_at as string,
      section: "vector" as LogSection,
      level: (r.status === "failed" ? "error" : "info") as LogLevel,
      message: `KB "${r.name}" · status=${r.status} · chunks=${r.chunk_count ?? 0}${r.error_message ? ` · ${r.error_message}` : ""}`,
    })),
  ].filter((e) => (section === "all" || e.section === section) && (level === "all" || e.level === level));

  const merged = [...live, ...persisted].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 200);
  return { entries: merged };
}

export async function getAdminKeysData() {
  const pub = publicEnv();
  const srv = serverEnv();
  const keys = aiKeys();
  const vec = milvusConfig();
  const rzp = razorpayEnv();
  const brv = brevoEnv();
  const db = createAdminClient();

  const platformCredentials: AdminPlatformCredentialItem[] = [
    { envKey: "ENCRYPTION_KEY", label: "AES-256-GCM Master Secret", group: "Core Cryptography", configured: Boolean(srv.ENCRYPTION_KEY), maskedPreview: mask(srv.ENCRYPTION_KEY) ?? null, note: `Key version: ${srv.ENCRYPTION_KEY_VERSION}` },
    { envKey: "SUPABASE_SECRET_KEY", label: "Supabase Service Role Key", group: "Database", configured: Boolean(srv.SUPABASE_SECRET_KEY), maskedPreview: mask(srv.SUPABASE_SECRET_KEY) ?? null, note: "Server-only admin client" },
    { envKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", label: "Supabase Anon/Publishable", group: "Database", configured: Boolean(pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), maskedPreview: mask(pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? null, note: "Public RLS key" },
    { envKey: "NVIDIA_API_KEY", label: "NVIDIA Build AI Key", group: "AI Gateways", configured: Boolean(keys.nvidia), maskedPreview: mask(keys.nvidia) ?? null, note: "Inference models" },
    { envKey: "AI_GATEWAY_API_KEY", label: "Vercel AI Gateway Key", group: "AI Gateways", configured: Boolean(keys.gateway), maskedPreview: mask(keys.gateway) ?? null, note: "Image/chat routing" },
    { envKey: "MILVUS_TOKEN", label: "Zilliz / Milvus Vector Token", group: "Vector & Cache", configured: Boolean(vec?.token), maskedPreview: mask(vec?.token) ?? null, note: vec ? `Collection: ${vec.collection}` : "Keyword fallback" },
    {
      envKey: "UPSTASH_REDIS_REST_TOKEN",
      label: "Distributed Cache & Rate Limit",
      group: "Vector & Cache",
      configured: isDistributedRateLimitActive(),
      maskedPreview: mask(process.env.UPSTASH_REDIS_REST_TOKEN) ?? (redisBackendKind() === "cloudflare-do" ? "CF DO SQLite" : null),
      note:
        redisBackendKind() === "upstash"
          ? "Upstash Redis REST active"
          : redisBackendKind() === "cloudflare-do"
            ? "Cloudflare Durable Object SQLite active (free edge tier)"
            : "In-memory fallback locally",
    },
    {
      envKey: "RELAYNEST_QUEUE",
      label: "Event Queue & Telegram Pacer",
      group: "Vector & Cache",
      configured: queueBackendKind() !== "none",
      maskedPreview: queueBackendKind() === "cloudflare-queues" ? "relaynest-events" : mask(process.env.KAFKA_REST_PASSWORD || process.env.UPSTASH_KAFKA_REST_PASSWORD) ?? null,
      note:
        queueBackendKind() === "cloudflare-queues"
          ? "Cloudflare Queues + DLQ active (free edge tier)"
          : queueBackendKind() === "kafka-rest"
            ? "External Kafka REST active"
            : "Unconfigured locally (auto-bound on Cloudflare)",
    },
    { envKey: "RAZORPAY_KEY_ID", label: "Razorpay Merchant Key", group: "Billing & Messaging", configured: Boolean(rzp.keyId), maskedPreview: mask(rzp.keyId) ?? null, note: rzp.webhookSecret ? "Webhook signed" : "Webhook unset" },
    {
      envKey: "BREVO_API_KEY",
      label: "Brevo Email Transactional Key",
      group: "Billing & Messaging",
      configured: Boolean(brv.apiKey) && !brv.isSmtpKey,
      maskedPreview: mask(brv.apiKey) ?? null,
      note: brv.isSmtpKey
        ? "Wrong key type: xsmtpsib- is an SMTP key (need v3 API key xkeysib-)"
        : !brv.apiKey
          ? "Set v3 API key (xkeysib-) & MAIL_FROM_ADDRESS"
          : brv.fromAddress
            ? `Sender: ${brv.fromAddress}`
            : "Key set · add MAIL_FROM_ADDRESS to enable sending",
    },
    {
      envKey: "MAIL_FROM_ADDRESS",
      label: "Brevo Verified Sender Email",
      group: "Billing & Messaging",
      configured: Boolean(brv.fromAddress),
      maskedPreview: null,
      note: brv.fromAddress ? `${brv.fromName} <${brv.fromAddress}>` : "Required alongside BREVO_API_KEY (verified in Brevo)",
    },
    { envKey: "CRON_SECRET", label: "Cron Scheduler Bearer Secret", group: "Scheduler & Admin", configured: Boolean(cronSecret()), maskedPreview: mask(cronSecret()) ?? null, note: "Protects /api/cron/tick" },
  ];

  const [wsRes, apiKeysRes, apiLogsRes] = await Promise.all([
    db.from("workspaces").select("id, name").limit(200),
    db.from("api_keys").select("id, workspace_id, name, key_prefix, environment, scopes, status, request_count, last_used_at, expires_at, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("api_request_logs").select("id, workspace_id, method, path, status_code, latency_ms, created_at").order("created_at", { ascending: false }).limit(40),
  ]);

  const wsMap = new Map((wsRes.data ?? []).map((w) => [w.id as string, (w.name as string) ?? "Workspace"]));
  const workspaceKeys: AdminKeyInventoryItem[] = (apiKeysRes.data ?? []).map((k) => ({
    id: k.id as string,
    name: k.name as string,
    keyPrefix: k.key_prefix as string,
    environment: String(k.environment),
    workspaceName: wsMap.get(k.workspace_id as string) ?? "Workspace",
    scopes: ((k.scopes as string[] | null) ?? []),
    status: String(k.status),
    requestCount: Number(k.request_count ?? 0),
    lastUsedAt: (k.last_used_at as string | null) ?? null,
    expiresAt: (k.expires_at as string | null) ?? null,
    createdAt: k.created_at as string,
  }));

  const recentApiCalls = (apiLogsRes.data ?? []).map((l) => ({
    id: l.id as string,
    workspaceName: wsMap.get(l.workspace_id as string) ?? "Workspace",
    method: String(l.method),
    path: String(l.path),
    statusCode: Number(l.status_code ?? 200),
    latencyMs: Number(l.latency_ms ?? 0),
    createdAt: l.created_at as string,
  }));

  return { platformCredentials, workspaceKeys, recentApiCalls };
}

export async function getAdminSecurityWarningsData() {
  const db = createAdminClient();
  const [auditRes, apiLogsRes, intErrRes, botHistRes, apiKeyRes] = await runBatched<unknown>([
    async () => db.from("user_audit_logs").select("id, user_email, event, page_path, detail, ip, created_at").like("event", "security.%").order("created_at", { ascending: false }).limit(80),
    async () => db.from("api_request_logs").select("id, workspace_id, method, path, status_code, created_at").gte("status_code", 400).order("created_at", { ascending: false }).limit(40),
    async () => db.from("integrations").select("id, name, provider, last_error, last_tested_at").not("last_error", "is", null).order("last_tested_at", { ascending: false }).limit(25),
    async () => db.from("bot_history").select("id, bot_name, telegram_username, event, occurred_at").eq("event", "deleted_on_telegram").order("occurred_at", { ascending: false }).limit(25),
    async () => db.from("api_keys").select("id, name, key_prefix, status, revoked_at").eq("status", "revoked").order("revoked_at", { ascending: false }).limit(25),
  ], 4);

  type QRes = { data?: Array<Record<string, unknown>> | null };

  const controls: AdminSecurityControl[] = [
    { id: "csp_hsts", title: "Strict CSP, HSTS Preload & Frame Denial", category: "Transport & XSS", status: "enforced", detail: "X-Frame-Options DENY, object-src 'none', HSTS 1yr, no-store on /admin & /api." },
    { id: "pw_hash", title: "PBKDF2-SHA256 Admin Hashing & Password Strength Policy", category: "Authentication", status: "enforced", detail: "100k-iteration PBKDF2-SHA256 admin verification, breached-password blocklist on signup, HTTP-only SameSite=Strict cookie." },
    {
      id: "rate_limit",
      title: "API Rate Limiting & Brute-Force Lockout",
      category: "Abuse Prevention",
      status: isDistributedRateLimitActive() ? "enforced" : "advisory",
      detail:
        redisBackendKind() === "upstash"
          ? "Distributed Upstash Redis + sliding-window 429 enforcement active."
          : redisBackendKind() === "cloudflare-do"
            ? "Distributed Cloudflare Durable Object SQLite + Telegram 429 pacing active."
            : "Sliding-window rate limiter active (Cloudflare Durable Object on edge, or set UPSTASH_REDIS_REST_URL locally).",
    },
    { id: "phishing_ssrf", title: "Anti-Phishing URL, Open Redirect & SSRF Guard", category: "Anti-Phishing", status: "enforced", detail: "Blocks Punycode IDN homographs, embedded credentials, private/metadata IPs, and external ?next= redirects." },
    { id: "api_sha256", title: "SHA-256 API Keys & AES-256-GCM Secret Vault", category: "Data Protection", status: serverEnv().ENCRYPTION_KEY ? "enforced" : "advisory", detail: "API tokens stored solely via irreversible SHA-256 hashes; bot tokens & integration URLs encrypted at rest." },
    { id: "cron_sec", title: "Cron & Webhook HMAC Verification", category: "Endpoints", status: cronSecret() ? "enforced" : "advisory", detail: cronSecret() ? "CRON_SECRET configured; webhooks verify timing-safe SHA-256 hashes." : "CRON_SECRET not configured in .env; schedule tick protection incomplete." },
  ];

  const warnings: AdminSecurityWarningItem[] = [];

  for (const r of (auditRes as QRes).data ?? []) {
    const ev = String(r.event);
    if (ev.startsWith("security.")) {
      warnings.push({
        id: `sec-${r.id}`,
        ts: r.created_at as string,
        severity: ev.includes("lockout") ? "critical" : ev.includes("failed") ? "warning" : "info",
        source: "Auth & Admin",
        title: ev.replace("security.", "").replace(/_/g, " "),
        detail: `${r.detail ?? ""} ${r.ip ? `(IP: ${r.ip})` : ""}`.trim(),
        actor: (r.user_email as string | null) ?? undefined,
      });
    }
  }

  for (const log of (apiLogsRes as QRes).data ?? []) {
    const code = Number(log.status_code);
    warnings.push({
      id: `apifail-${log.id}`,
      ts: log.created_at as string,
      severity: code === 429 || code === 401 || code === 403 ? "warning" : "info",
      source: "REST API",
      title: `API ${log.method} ${log.path} returned HTTP ${code}`,
      detail: code === 429 ? "Rate limit triggered" : code >= 500 ? "Server fault during API call" : "Client unauthorized or rejected",
    });
  }

  for (const errInt of (intErrRes as QRes).data ?? []) {
    warnings.push({
      id: `int-${errInt.id}`,
      ts: (errInt.last_tested_at as string | null) ?? new Date().toISOString(),
      severity: "warning",
      source: "Integrations",
      title: `Webhook failure on ${errInt.name} (${errInt.provider})`,
      detail: String(errInt.last_error ?? "Delivery failed"),
    });
  }

  for (const bh of (botHistRes as QRes).data ?? []) {
    warnings.push({
      id: `tgdel-${bh.id}`,
      ts: bh.occurred_at as string,
      severity: "warning",
      source: "Telegram Sync",
      title: `Bot "${bh.bot_name}" revoked or deleted externally on Telegram`,
      detail: bh.telegram_username ? `@${bh.telegram_username} flagged via two-way sync.` : "Two-way sync flagged token revocation.",
    });
  }

  for (const k of (apiKeyRes as QRes).data ?? []) {
    warnings.push({
      id: `rev-${k.id}`,
      ts: (k.revoked_at as string | null) ?? new Date().toISOString(),
      severity: "info",
      source: "API Keys",
      title: `API key revoked: ${k.name} (${k.key_prefix}•••)`,
      detail: "Token disabled permanently against Bearer auth.",
    });
  }

  for (const l of getConsoleLogs("all", "all")) {
    if (l.level === "error" || l.level === "warn") {
      warnings.push({
        id: `log-${l.id}`,
        ts: l.ts,
        severity: l.level === "error" ? "critical" : "warning",
        source: `Runtime (${l.section})`,
        title: l.message,
        detail: l.meta ? JSON.stringify(l.meta) : "Captured from server runtime log",
      });
    }
  }

  warnings.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return { controls, warnings: warnings.slice(0, 120) };
}

export { clearConsoleLogs, logEvent };
