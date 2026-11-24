import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { commandInput, commandsBatchInput, uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { createCommands, listCommands, replaceCommands } from "@backend/server/repositories/commands";

type Ctx = { params: Promise<{ botId: string }> };

export const GET = route<Ctx>(async (_req, { params }, requestId) => {
  const ctx = await requireAuth();
  return ok(await listCommands(ctx, uuid.parse((await params).botId)), {}, 200, requestId);
});

export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const { commands } = commandsBatchInput.parse(await readJson(req));
  return ok(await createCommands(ctx, uuid.parse((await params).botId), commands), {}, 201, requestId);
});

export const PUT = route<Ctx>(async (req, { params }, requestId) => {
  const ctx = await requireAuth();
  const { commands } = z.object({ commands: z.array(commandInput).max(30) }).parse(await readJson(req));
  return ok(await replaceCommands(ctx, uuid.parse((await params).botId), commands), {}, 200, requestId);
});