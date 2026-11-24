import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { uuid } from "@backend/lib/validation/schemas";
import { withApiAccess } from "@backend/server/auth/context";
import { deleteIntegration, toggleIntegration } from "@backend/server/services/integrations";

type Ctx = { params: Promise<{ integrationId: string }> };

const patchSchema = z.object({ enabled: z.boolean() });

export const PATCH = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const id = uuid.parse((await params).integrationId);
    const { enabled } = patchSchema.parse(await readJson(req));
    return ok(await toggleIntegration(ctx, id, enabled), {}, 200, requestId);
  }),
);

export const DELETE = route<Ctx>(async (req, { params }, requestId) =>
  withApiAccess(req, "integrations:write", async (ctx) => {
    const id = uuid.parse((await params).integrationId);
    await deleteIntegration(ctx, id);
    return ok({ deleted: true }, {}, 200, requestId);
  }),
);
