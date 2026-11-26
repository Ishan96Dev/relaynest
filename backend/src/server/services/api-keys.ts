import "server-only";
import { z } from "zod";
import { ALL_API_SCOPES, type ApiScope } from "@backend/lib/api/openapi";
import { randomToken, sha256Hex } from "@backend/lib/crypto";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { notify } from "@backend/server/notifications";

export const createApiKeyInput = z.object({
  name: z.string().trim().min(1, "Enter a descriptive key name.").max(80),
  environment: z.enum(["production", "development"]).default("production"),
  scopes: z.array(z.enum(ALL_API_SCOPES)).min(1, "Select at least one permission scope.").max(16),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(90),
});

export interface ApiKeyDto {
  id: string;
  name: string;
  keyPrefix: string;
  environment: "production" | "development";
  scopes: ApiScope[];
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiRequestLogDto {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

export interface ApiKeysPageData {
  demo: boolean;
  keys: ApiKeyDto[];
  stats: {
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    lastRequestAt: string | null;
    totalRequests7d: number;
    successfulRequests7d: number;
    failedRequests7d: number;
  };
  usage7d: Array<{ day: string; value: number }>;
  recentLogs: ApiRequestLogDto[];
}

function mapKeyRow(row: Record<string, unknown>): ApiKeyDto {
  const expiresAt = (row.expires_at as string | null) ?? null;
  const rawStatus = row.status as string;
  const isExpired = rawStatus === "active" && expiresAt && new Date(expiresAt).getTime() <= Date.now();
  return {
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    environment: (row.environment as ApiKeyDto["environment"]) ?? "production",
    scopes: ((row.scopes as string[]) ?? []) as ApiScope[],
    status: rawStatus === "revoked" ? "revoked" : isExpired ? "expired" : "active",
    expiresAt,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    requestCount: Number(row.request_count ?? 0),
    createdAt: row.created_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

export function generateRawApiKey(environment: "production" | "development"): {
  plaintextToken: string;
  keyPrefix: string;
} {
  const prefix = environment === "production" ? "rnk_live_" : "rnk_test_";
  const secretPart = randomToken(24);
  const plaintextToken = `${prefix}${secretPart}`;
  return { plaintextToken, keyPrefix: plaintextToken.slice(0, 17) };
}

export async function listApiKeysPageData(ctx: AuthContext): Promise<ApiKeysPageData> {
  if (!isSupabaseConfigured()) {
    return {
      demo: true,
      keys: [],
      stats: { totalKeys: 0, activeKeys: 0, revokedKeys: 0, lastRequestAt: null, totalRequests7d: 0, successfulRequests7d: 0, failedRequests7d: 0 },
      usage7d: [],
      recentLogs: [],
    };
  }

  const since = new Date(Date.now() - 6 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [keysRes, logsRes] = await Promise.all([
    ctx.supabase
      .from("api_keys")
      .select("id, name, key_prefix, environment, scopes, status, expires_at, last_used_at, request_count, created_at, revoked_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false }),
    ctx.supabase
      .from("api_request_logs")
      .select("id, method, path, status_code, latency_ms, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const keys = ((keysRes.data as Record<string, unknown>[] | null) ?? []).map(mapKeyRow);
  const logs = ((logsRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: r.id as string,
    method: r.method as string,
    path: r.path as string,
    statusCode: Number(r.status_code ?? 200),
    latencyMs: Number(r.latency_ms ?? 0),
    createdAt: r.created_at as string,
  }));

  const perDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    perDay.set(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  let ok7d = 0;
  let bad7d = 0;
  for (const log of logs) {
    const day = log.createdAt.slice(0, 10);
    if (perDay.has(day)) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (log.statusCode >= 200 && log.statusCode < 400) ok7d++;
    else bad7d++;
  }

  const activeKeys = keys.filter((k) => k.status === "active").length;
  const revokedKeys = keys.filter((k) => k.status === "revoked").length;
  const lastUsedFromKeys = keys
    .map((k) => k.lastUsedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const lastRequestAt = logs[0]?.createdAt ?? lastUsedFromKeys ?? null;

  return {
    demo: false,
    keys,
    stats: {
      totalKeys: keys.length,
      activeKeys,
      revokedKeys,
      lastRequestAt,
      totalRequests7d: logs.length,
      successfulRequests7d: ok7d,
      failedRequests7d: bad7d,
    },
    usage7d: [...perDay].map(([d, value]) => ({
      day: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      value,
    })),
    recentLogs: logs.slice(0, 12),
  };
}

export async function createApiKey(
  ctx: AuthContext,
  input: z.infer<typeof createApiKeyInput>,
  opts?: { skipNotify?: boolean },
): Promise<{ key: ApiKeyDto; plaintextToken: string }> {
  requireWrite(ctx);
  const { plaintextToken, keyPrefix } = generateRawApiKey(input.environment);
  const keyHash = await sha256Hex(plaintextToken);
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      workspace_id: ctx.workspaceId,
      name: input.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      environment: input.environment,
      scopes: input.scopes,
      status: "active",
      expires_at: expiresAt,
      created_by: ctx.userId,
    })
    .select("id, name, key_prefix, environment, scopes, status, expires_at, last_used_at, request_count, created_at, revoked_at")
    .single();

  if (error || !data) throw new Error(`Failed to create API key: ${error?.message ?? "unknown"}`);

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "api_key.created",
      detail: `${input.name} (${keyPrefix}•••)`,
    }),
    opts?.skipNotify
      ? Promise.resolve()
      : notify({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          kind: "api_key_created",
          title: `API key created: ${input.name}`,
          body: `New ${input.environment} key (${keyPrefix}•••) with ${input.scopes.length} scope(s) was created.`,
          emailKey: "apiKeys",
        }),
  ]);

  return { key: mapKeyRow(data as Record<string, unknown>), plaintextToken };
}

export async function revokeApiKey(ctx: AuthContext, keyId: string): Promise<ApiKeyDto> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("workspace_id", ctx.workspaceId)
    .select("id, name, key_prefix, environment, scopes, status, expires_at, last_used_at, request_count, created_at, revoked_at")
    .maybeSingle();

  if (error) throw new Error("Failed to revoke API key");
  if (!data) throw Errors.notFound("API key");

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "api_key.revoked",
      detail: `${data.name} (${data.key_prefix}•••)`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "api_key_revoked",
      title: `API key revoked: ${data.name}`,
      body: `Key ${data.key_prefix}••• can no longer authenticate requests.`,
      emailKey: "apiKeys",
    }),
  ]);

  return mapKeyRow(data as Record<string, unknown>);
}

export async function rotateApiKey(
  ctx: AuthContext,
  keyId: string,
): Promise<{ key: ApiKeyDto; plaintextToken: string }> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("api_keys")
    .select("id, name, environment, scopes, expires_at")
    .eq("id", keyId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!existing) throw Errors.notFound("API key");

  await admin
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("workspace_id", ctx.workspaceId);

  const env = (existing.environment as "production" | "development") ?? "production";
  const scopes = ((existing.scopes as ApiScope[]) ?? ["bots:read"]) as [ApiScope, ...ApiScope[]];
  const created = await createApiKey(
    ctx,
    {
      name: `${existing.name as string} (Rotated)`,
      environment: env,
      scopes,
      expiresInDays: 90,
    },
    { skipNotify: true },
  );
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "api_key_rotated",
    title: `API key rotated: ${existing.name as string}`,
    body: `Previous key was revoked and replaced with ${created.key.keyPrefix}•••.`,
    emailKey: "apiKeys",
  });
  return created;
}

export async function deleteApiKey(ctx: AuthContext, keyId: string): Promise<void> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("api_keys")
    .select("id, name, key_prefix")
    .eq("id", keyId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!existing) throw Errors.notFound("API key");
  const { error } = await admin.from("api_keys").delete().eq("id", keyId).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete API key");

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "api_key.deleted",
      detail: `${existing.name} (${existing.key_prefix}•••)`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "api_key_deleted",
      title: `API key deleted: ${existing.name as string}`,
      body: `Key ${existing.key_prefix as string}••• was permanently removed.`,
    }),
  ]);
}
