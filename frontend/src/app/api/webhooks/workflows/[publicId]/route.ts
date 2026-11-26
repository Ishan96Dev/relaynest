import { safeEqual, sha256Hex } from "@backend/lib/crypto";
import { ApiError, fail, newRequestId } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { enforceRateLimit } from "@backend/server/security/rate-limit";
import { notifyOwners } from "@backend/server/notifications";
import { runWorkflow } from "@backend/server/services/workflow-runner";
const MAX_BODY = 64 * 1024;
export const maxDuration = 60;
/**
 * Incoming webhook trigger. Send the secret in the `x-relaynest-secret` header (or as a Bearer token).
 * The JSON body becomes the event payload, readable in the workflow as {{event.field}}.
 * An optional `Idempotency-Key` header makes retries safe: the same key never runs the workflow twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const requestId = newRequestId();
  try {
    const { publicId } = await params;
    if (!/^[a-f0-9]{24}$/.test(publicId)) return new Response(null, { status: 404 });
    await enforceRateLimit(`wh:${publicId}`, 60, 60_000);
    const secret = req.headers.get("x-relaynest-secret") ?? /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
    const { data: hook } = await createAdminClient().from("webhook_endpoints").select("workspace_id, workflow_id, secret_hash, enabled").eq("public_id", publicId).maybeSingle();
    // One answer for an unknown endpoint and a wrong secret, so endpoint IDs cannot be probed.
    if (!hook || !hook.enabled || !secret || !safeEqual(await sha256Hex(secret), hook.secret_hash as string)) return new Response(null, { status: 401 });
    const text = await req.text();
    if (text.length > MAX_BODY) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Body is too large.");
    let payload: Record<string, unknown> = {};
    if (text.trim()) {
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new ApiError(400, "MALFORMED_JSON", "Body must be JSON."); }
      payload = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : { body: json };
    }
    const key = req.headers.get("idempotency-key")?.slice(0, 128);
    const r = await runWorkflow({ workflowId: hook.workflow_id as string, trigger: "webhook", payload, idempotencyKey: key ? `wh:${publicId}:${key}` : undefined });
    if (r.outcome === "skipped") {
      if (r.reason === "plan_limit") throw new ApiError(402, "PLAN_LIMIT", "The workspace has used its automation executions for this month.");
      if (r.reason === "duplicate") return Response.json({ data: { status: "duplicate" }, meta: { requestId } });
      throw new ApiError(409, "NOT_ACTIVE", "This automation is not active.");
    }
    void notifyOwners(hook.workspace_id as string, {
      kind: "webhook_triggered",
      title: "Incoming webhook triggered",
      body: `Endpoint ${publicId} triggered execution ${r.executionId} (${r.result.status}).`,
      dedupeHours: 0.01,
    });
    return Response.json({ data: { status: r.result.status, executionId: r.executionId }, meta: { requestId } }, { status: 200 });
  } catch (e) {
    return fail(e, requestId);
  }
}
