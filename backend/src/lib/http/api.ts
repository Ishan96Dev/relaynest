import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logEvent } from "@backend/server/logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message);
  }
}

export const Errors = {
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Authentication is required."),
  forbidden: () => new ApiError(403, "FORBIDDEN", "You do not have access to this resource."),
  notFound: (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} was not found.`),
  conflict: (msg: string) => new ApiError(409, "CONFLICT", msg),
  invalid: (msg: string, details: unknown[] = []) => new ApiError(422, "UNPROCESSABLE", msg, details),
  telegramBotDeleted: (msg = "This bot was deleted on Telegram or its token was revoked in @BotFather.") =>
    new ApiError(410, "TELEGRAM_BOT_DELETED", msg),
  telegramRateLimited: (retryAfterSec: number, msg = "Telegram rate limit reached. Message will be retried shortly.") =>
    new ApiError(429, "TELEGRAM_RATE_LIMITED", msg, [{ retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) }]),
  upstream: (msg: string) => new ApiError(502, "UPSTREAM_ERROR", msg),
  notConfigured: () => new ApiError(503, "NOT_CONFIGURED", "The server is not configured for this operation."),
};

export function newRequestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function ok<T>(data: T, meta: Record<string, unknown> = {}, status = 200, requestId = newRequestId()) {
  return NextResponse.json({ data, meta: { requestId, ...meta } }, { status });
}

export function fail(err: unknown, requestId = newRequestId()) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request is invalid.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        meta: { requestId },
      },
      { status: 400 },
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details }, meta: { requestId } },
      { status: err.status },
    );
  }
  // Never leak internals; log only the message, not payloads.
  const msg = err instanceof Error ? err.message : "unknown";
  logEvent("api", "error", `[${requestId}] unhandled: ${msg}`);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong.", details: [] }, meta: { requestId } },
    { status: 500 },
  );
}

type Handler<C> = (req: Request, ctx: C, requestId: string) => Promise<Response>;

/** Wraps a Route Handler with request IDs, console telemetry, and uniform error envelopes. */
export function route<C = unknown>(handler: Handler<C>) {
  return async (req: Request, ctx: C) => {
    const requestId = newRequestId();
    const started = Date.now();
    const path = (() => { try { return new URL(req.url).pathname; } catch { return req.url; } })();
    try {
      const res = await handler(req, ctx, requestId);
      if (!path.startsWith("/api/admin/logs")) {
        logEvent("api", res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info", `${req.method} ${path} -> ${res.status}`, {
          requestId, ms: Date.now() - started,
        });
      }
      return res;
    } catch (e) {
      const res = fail(e, requestId);
      logEvent("api", res.status >= 500 ? "error" : "warn", `${req.method} ${path} -> ${res.status}`, {
        requestId, ms: Date.now() - started, error: e instanceof Error ? e.message : "unknown",
      });
      return res;
    }
  };
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "MALFORMED_JSON", "Request body must be valid JSON.");
  }
}
