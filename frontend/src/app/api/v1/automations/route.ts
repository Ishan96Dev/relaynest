import { ok, readJson, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { automationInput, createAutomation } from "@backend/server/services/automations";

export const GET = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "workflows:read", async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("workflows")
      .select("id, name, description, status, version, published_at, created_at, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Failed to list automations");
    return ok(data ?? [], {}, 200, requestId);
  }),
);

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "workflows:write", async (ctx) =>
    ok(await createAutomation(ctx, automationInput.parse(await readJson(req, 512 * 1024))), {}, 201, requestId),
  ),
);