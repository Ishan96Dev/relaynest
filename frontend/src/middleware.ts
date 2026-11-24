import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@backend/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/Admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin" + url.pathname.slice(6);
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

/**
 * Runs only where a session decision is needed: protected app pages and the auth pages.
 * API routes authenticate themselves, and marketing pages, assets and webhooks skip it entirely.
 */
export const config = {
  matcher: [
    "/dashboard/:path*", "/bots/:path*", "/agents/:path*", "/workflows/:path*", "/integrations/:path*",
    "/executions/:path*", "/analytics/:path*", "/settings/:path*", "/knowledge-base/:path*", "/ai/:path*",
    "/Admin/:path*", "/login", "/signup", "/forgot-password",
  ],
};