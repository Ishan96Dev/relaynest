import { after } from "next/server";
import { newRequestId } from "@backend/lib/http/api";
import { receiveTelegramUpdate } from "@backend/server/services/telegram-webhook";
import type { TelegramUpdate } from "@backend/server/telegram/client";

const MAX_BODY = 64 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ botPublicId: string }> }) {
  const { botPublicId } = await params;
  if (!/^[a-f0-9]{24}$/.test(botPublicId)) return new Response(null, { status: 404 });

  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let update: TelegramUpdate;
  try {
    update = JSON.parse(text);
    if (typeof update?.update_id !== "number") throw new Error();
  } catch {
    return new Response(null, { status: 400 });
  }

  try {
    const r = await receiveTelegramUpdate(botPublicId, req.headers.get("x-telegram-bot-api-secret-token"), update);
    if (r.outcome === "unauthorized") return new Response(null, { status: 401 });
    if (r.outcome === "ok") after(() => r.process().catch(() => console.error(`[${newRequestId()}] telegram processing failed`)));
    return new Response(null, { status: 200 });
  } catch {
    console.error("telegram webhook error");
    return new Response(null, { status: 500 });
  }
}
