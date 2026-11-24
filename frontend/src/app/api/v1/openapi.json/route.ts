import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@backend/lib/api/openapi";
import { publicEnv } from "@backend/lib/env/public";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let serverUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    if (u.origin) serverUrl = u.origin;
  } catch { /* fallback to configured public URL */ }
  return NextResponse.json(buildOpenApiSpec(serverUrl), {
    headers: { "Cache-Control": "no-store" },
  });
}
