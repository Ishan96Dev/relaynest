import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { deleteWebhookEndpoint, toggleWebhookEndpoint } from "@backend/server/services/integrations";

type Ctx = { params: Promise<{ endpointId: string }> };

export const PATCH = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const id = uuid.parse((await params).endpointId);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await readJson(req));
    await toggleWebhookEndpoint(ctx, id, enabled);
    return ok({ enabled }, {}, 200, requestId);
  }),
);

export const DELETE = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const id = uuid.parse((await params).endpointId);
    await deleteWebhookEndpoint(ctx, id);
    return ok({ deleted: true }, {}, 200, requestId);
  }),
);
