import "server-only";
import { z } from "zod";
import { INTEGRATION_EVENT_META, type IntegrationEvent } from "@backend/lib/api/openapi";
import {
  decryptSecret, encryptSecret, maskWebhookUrl, randomToken, sha256Hex, signWebhookPayload,
} from "@backend/lib/crypto";
import { isSupabaseConfigured, publicEnv } from "@backend/lib/env/public";
import { serverEnv } from "@backend/lib/env/server";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { requireWrite, type AuthContext } from "@backend/server/auth/context";
import { notify } from "@backend/server/notifications";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

const ALL_EVENTS = INTEGRATION_EVENT_META.map((e) => e.id) as [IntegrationEvent, ...IntegrationEvent[]];

export const createIntegrationInput = z.object({
  provider: z.enum(["slack", "discord", "webhook"]),
  name: z.string().trim().min(1, "Enter an integration name.").max(80),
  webhookUrl: z.string().trim().url("Enter a valid HTTPS webhook URL.").max(500),
  signingSecret: z.string().trim().max(160).optional(),
  events: z.array(z.enum(ALL_EVENTS)).min(1, "Choose at least one event.").max(12),
});

export interface IntegrationDto {
  id: string;
  provider: "slack" | "discord" | "webhook";
  name: string;
  status: "active" | "paused" | "disconnected";
  events: IntegrationEvent[];
  targetPreview: string | null;
  lastTestedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface WebhookEndpointDto {
  id: string;
  publicId: string;
  workflowId: string;
  workflowName: string;
  workflowStatus: string;
  url: string;
  enabled: boolean;
  createdAt: string;
}

export interface IntegrationsPageData {
  demo: boolean;
  bots: Array<{ id: string; name: string; username: string | null; status: string; webhookStatus: string; messagesCount: number }>;
  workflows: Array<{ id: string; name: string; status: string }>;
  webhookEndpoints: WebhookEndpointDto[];
  integrations: IntegrationDto[];
}

function mapIntegration(row: Record<string, unknown>): IntegrationDto {
  return {
    id: row.id as string,
    provider: (row.provider as IntegrationDto["provider"]) ?? "webhook",
    name: row.name as string,
    status: (row.status as IntegrationDto["status"]) ?? "active",
    events: ((row.events as string[]) ?? []) as IntegrationEvent[],
    targetPreview: (row.target_preview as string | null) ?? null,
    lastTestedAt: (row.last_tested_at as string | null) ?? null,
    lastStatus: (row.last_status as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getIntegrationsData(ctx: AuthContext): Promise<IntegrationsPageData> {
  if (!isSupabaseConfigured()) {
    return { demo: true, bots: [], workflows: [], webhookEndpoints: [], integrations: [] };
  }

  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const [botsRes, wfRes, hookRes, intRes] = await Promise.all([
    ctx.supabase.from("bots").select("id, name, telegram_username, status, webhook_status, messages_count").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }),
    ctx.supabase.from("workflows").select("id, name, status").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }),
    ctx.supabase.from("webhook_endpoints").select("id, workflow_id, public_id, enabled, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }),
    ctx.supabase.from("integrations").select("id, provider, name, status, events, target_preview, last_tested_at, last_status, last_error, created_at").eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }),
  ]);

  const wfMap = new Map<string, { name: string; status: string }>();
  const workflows = ((wfRes.data as Record<string, unknown>[] | null) ?? []).map((w) => {
    const item = { id: w.id as string, name: w.name as string, status: w.status as string };
    wfMap.set(item.id, { name: item.name, status: item.status });
    return item;
  });

  const webhookEndpoints: WebhookEndpointDto[] = ((hookRes.data as Record<string, unknown>[] | null) ?? []).map((h) => {
    const wf = wfMap.get(h.workflow_id as string);
    return {
      id: h.id as string,
      publicId: h.public_id as string,
      workflowId: h.workflow_id as string,
      workflowName: wf?.name ?? "Automation",
      workflowStatus: wf?.status ?? "draft",
      url: `${appUrl}/api/webhooks/workflows/${h.public_id as string}`,
      enabled: Boolean(h.enabled),
      createdAt: h.created_at as string,
    };
  });

  const bots = ((botsRes.data as Record<string, unknown>[] | null) ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    username: (b.telegram_username as string | null) ?? null,
    status: b.status as string,
    webhookStatus: b.webhook_status as string,
    messagesCount: Number(b.messages_count ?? 0),
  }));

  const integrations = ((intRes.data as Record<string, unknown>[] | null) ?? []).map(mapIntegration);
  return { demo: false, bots, workflows, webhookEndpoints, integrations };
}

export async function createIntegration(
  ctx: AuthContext,
  input: z.infer<typeof createIntegrationInput>,
): Promise<IntegrationDto> {
  requireWrite(ctx);
  try {
    assertSafeOutboundUrl(input.webhookUrl);
  } catch (e) {
    throw Errors.invalid(e instanceof Error ? e.message : "Invalid HTTPS webhook URL.");
  }

  const secret = input.signingSecret?.trim() || randomToken(18);
  const env = serverEnv();
  const encrypted = await encryptSecret(
    JSON.stringify({ webhookUrl: input.webhookUrl, signingSecret: secret }),
    env.ENCRYPTION_KEY,
    env.ENCRYPTION_KEY_VERSION,
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .insert({
      workspace_id: ctx.workspaceId,
      provider: input.provider,
      name: input.name,
      status: "active",
      encrypted_config: encrypted,
      events: input.events,
      target_preview: maskWebhookUrl(input.webhookUrl),
    })
    .select("id, provider, name, status, events, target_preview, last_tested_at, last_status, last_error, created_at")
    .single();

  if (error || !data) throw new Error(`Failed to connect integration: ${error?.message ?? "unknown"}`);

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "integration.connected",
      detail: `${input.name} (${input.provider})`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "integration_connected",
      title: `Integration connected: ${input.name}`,
      body: `Subscribed ${input.provider} target (${maskWebhookUrl(input.webhookUrl)}) to ${input.events.length} event(s).`,
    }),
  ]);

  return mapIntegration(data as Record<string, unknown>);
}

export async function toggleIntegration(
  ctx: AuthContext,
  integrationId: string,
  enabled: boolean,
): Promise<IntegrationDto> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .update({ status: enabled ? "active" : "paused" })
    .eq("id", integrationId)
    .eq("workspace_id", ctx.workspaceId)
    .select("id, provider, name, status, events, target_preview, last_tested_at, last_status, last_error, created_at")
    .maybeSingle();

  if (error) throw new Error("Failed to update integration");
  if (!data) throw Errors.notFound("Integration");
  await notify({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    kind: "integration_toggled",
    title: enabled ? `Integration resumed: ${data.name as string}` : `Integration paused: ${data.name as string}`,
    body: enabled
      ? `Your ${data.provider as string} integration is active and will deliver subscribed events.`
      : `Outbound delivery for this ${data.provider as string} integration is paused.`,
  });
  return mapIntegration(data as Record<string, unknown>);
}

export async function deleteIntegration(ctx: AuthContext, integrationId: string): Promise<void> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("integrations")
    .select("id, name, provider")
    .eq("id", integrationId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!existing) throw Errors.notFound("Integration");
  const { error } = await admin.from("integrations").delete().eq("id", integrationId).eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete integration");

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "integration.deleted",
      detail: `${existing.name} (${existing.provider})`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "integration_deleted",
      title: `Integration removed: ${existing.name}`,
      body: `Your ${existing.provider} channel integration was removed.`,
    }),
  ]);
}

function buildProviderPayload(provider: string, event: string, summary: string, data: Record<string, unknown>) {
  if (provider === "slack") {
    return { text: `*RelayNest* · \`${event}\`\n${summary}` };
  }
  if (provider === "discord") {
    return { content: `**RelayNest · \`${event}\`** — ${summary}` };
  }
  return { event, timestamp: new Date().toISOString(), summary, data };
}

export async function deliverOutboundWebhook(opts: {
  integrationId: string;
  workspaceId: string;
  provider: string;
  name: string;
  encryptedConfig: string;
  event: IntegrationEvent;
  summary: string;
  payloadData: Record<string, unknown>;
}): Promise<{ delivered: boolean; statusCode: number; latencyMs: number; error: string | null }> {
  const started = Date.now();
  const admin = createAdminClient();
  try {
    const raw = await decryptSecret(opts.encryptedConfig, serverEnv().ENCRYPTION_KEY);
    const cfg = JSON.parse(raw) as { webhookUrl: string; signingSecret?: string };
    const safeUrl = assertSafeOutboundUrl(cfg.webhookUrl);
    const body = JSON.stringify(buildProviderPayload(opts.provider, opts.event, opts.summary, opts.payloadData));
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "RelayNest-Webhooks/0.1",
      "X-RelayNest-Event": opts.event,
    };
    if (cfg.signingSecret) {
      headers["X-RelayNest-Signature"] = await signWebhookPayload(body, cfg.signingSecret);
    }
    const res = await fetch(safeUrl.toString(), {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Math.max(1, Math.round(Date.now() - started));
    const ok = res.ok;
    const statusLabel = `HTTP ${res.status}`;
    const errMsg = ok ? null : `Endpoint returned HTTP ${res.status}`;
    await admin
      .from("integrations")
      .update({ last_tested_at: new Date().toISOString(), last_status: statusLabel, last_error: errMsg })
      .eq("id", opts.integrationId);
    return { delivered: ok, statusCode: res.status, latencyMs, error: errMsg };
  } catch (e) {
    const latencyMs = Math.max(1, Math.round(Date.now() - started));
    const errMsg = e instanceof Error ? e.message : "Delivery failed";
    await admin
      .from("integrations")
      .update({ last_tested_at: new Date().toISOString(), last_status: "ERROR", last_error: errMsg.slice(0, 200) })
      .eq("id", opts.integrationId);
    return { delivered: false, statusCode: 0, latencyMs, error: errMsg };
  }
}

export async function testIntegration(
  ctx: AuthContext,
  integrationId: string,
): Promise<{ delivered: boolean; statusCode: number; latencyMs: number; error: string | null }> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("integrations")
    .select("id, workspace_id, provider, name, encrypted_config")
    .eq("id", integrationId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!row || !row.encrypted_config) throw Errors.notFound("Integration");

  const result = await deliverOutboundWebhook({
    integrationId: row.id as string,
    workspaceId: ctx.workspaceId,
    provider: row.provider as string,
    name: row.name as string,
    encryptedConfig: row.encrypted_config as string,
    event: "integration.tested",
    summary: `Live connectivity check sent from RelayNest workspace by user.`,
    payloadData: { workspaceId: ctx.workspaceId, integrationId: row.id, test: true },
  });

  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: result.delivered ? "integration.tested" : "integration.test_failed",
      detail: `${row.name}: ${result.delivered ? `HTTP ${result.statusCode}` : result.error}`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: result.delivered ? "integration_tested" : "integration_failed",
      title: result.delivered ? `Integration test delivered: ${row.name}` : `Integration test failed: ${row.name}`,
      body: result.delivered
        ? `Target responded HTTP ${result.statusCode} in ${result.latencyMs}ms.`
        : `Delivery failed (${result.error ?? "network error"}). Check destination URL and firewall settings.`,
    }),
  ]);

  return result;
}

/** Dispatches matching outbound channel integrations when workspace events occur; never throws. */
export async function dispatchWorkspaceEvent(
  workspaceId: string,
  event: IntegrationEvent,
  summary: string,
  payloadData: Record<string, unknown> = {},
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("integrations")
      .select("id, provider, name, encrypted_config, events")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    const matching = (rows ?? []).filter((r) => {
      const ev = (r.events as string[] | null) ?? [];
      return Boolean(r.encrypted_config) && ev.includes(event);
    });
    await Promise.allSettled(
      matching.map((r) =>
        deliverOutboundWebhook({
          integrationId: r.id as string,
          workspaceId,
          provider: r.provider as string,
          name: r.name as string,
          encryptedConfig: r.encrypted_config as string,
          event,
          summary,
          payloadData,
        }),
      ),
    );
  } catch (e) {
    console.error("[dispatchWorkspaceEvent] failed:", e instanceof Error ? e.message : e);
  }
}

export async function provisionWebhookEndpoint(
  ctx: AuthContext,
  workflowId: string,
): Promise<{ endpoint: WebhookEndpointDto; secret: string }> {
  requireWrite(ctx);
  const admin = createAdminClient();
  const { data: wf } = await admin
    .from("workflows")
    .select("id, name, status")
    .eq("id", workflowId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!wf) throw Errors.notFound("Automation");

  const secret = randomToken(24);
  const secretHash = await sha256Hex(secret);

  const { data: existing } = await admin
    .from("webhook_endpoints")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  let row: Record<string, unknown> | null = null;
  if (existing) {
    const res = await admin
      .from("webhook_endpoints")
      .update({ secret_hash: secretHash, enabled: true })
      .eq("id", existing.id)
      .select("id, public_id, workflow_id, enabled, created_at")
      .single();
    row = res.data as Record<string, unknown> | null;
  } else {
    const res = await admin
      .from("webhook_endpoints")
      .insert({ workspace_id: ctx.workspaceId, workflow_id: workflowId, secret_hash: secretHash, enabled: true })
      .select("id, public_id, workflow_id, enabled, created_at")
      .single();
    row = res.data as Record<string, unknown> | null;
  }
  if (!row) throw new Error("Failed to provision incoming webhook endpoint");

  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  await Promise.all([
    admin.from("activity_logs").insert({
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      action: "webhook.provisioned",
      detail: `${wf.name}`,
    }),
    notify({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "webhook_provisioned",
      title: `Webhook endpoint ready: ${wf.name}`,
      body: "Incoming webhook endpoint created/rotated with a new secret.",
    }),
  ]);

  return {
    endpoint: {
      id: row.id as string,
      publicId: row.public_id as string,
      workflowId,
      workflowName: wf.name as string,
      workflowStatus: wf.status as string,
      url: `${appUrl}/api/webhooks/workflows/${row.public_id as string}`,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at as string,
    },
    secret,
  };
}

export async function toggleWebhookEndpoint(ctx: AuthContext, endpointId: string, enabled: boolean): Promise<void> {
  requireWrite(ctx);
  const { error } = await createAdminClient()
    .from("webhook_endpoints")
    .update({ enabled })
    .eq("id", endpointId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to update webhook endpoint");
}

export async function deleteWebhookEndpoint(ctx: AuthContext, endpointId: string): Promise<void> {
  requireWrite(ctx);
  const { error } = await createAdminClient()
    .from("webhook_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) throw new Error("Failed to delete webhook endpoint");
}
