import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { withApiAccess } from "@backend/server/auth/context";
import { provisionWebhookEndpoint } from "@backend/server/services/integrations";

const schema = z.object({ workflowId: z.string().uuid() });

export const POST = route(async (req, _ctx, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const { workflowId } = schema.parse(await readJson(req));
    return ok(await provisionWebhookEndpoint(ctx, workflowId), {}, 201, requestId);
  }),
);
