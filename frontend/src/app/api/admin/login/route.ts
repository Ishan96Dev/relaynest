import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@backend/lib/http/api";
import { hasTrustedOrigin } from "@backend/lib/security/phishing";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { ADMIN_COOKIE, adminConfigured, createAdminSessionCookie, verifyAdminCredentials } from "@backend/server/admin/auth";
import { assertAdminNotLocked, clearAdminFailures, extractClientIp, rateLimit, recordAdminFailure } from "@backend/server/security/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const POST = route(async (req, _ctx, requestId) => {
  if (!hasTrustedOrigin(req)) {
    throw new ApiError(403, "UNTRUSTED_ORIGIN", "Cross-site login attempt blocked.");
  }
  const ip = extractClientIp(req);
  rateLimit(`admin-login-ip:${ip}`, 10, 60_000);
  if (!(await adminConfigured())) {
    throw new ApiError(503, "ADMIN_NOT_CONFIGURED", "Admin credentials are not set in platform_admins or .env yet.");
  }
  const { email, password } = loginSchema.parse(await readJson(req));
  assertAdminNotLocked(ip, email);

  const verifiedEmail = await verifyAdminCredentials(email, password);
  if (!verifiedEmail) {
    await recordAdminFailure(ip, email);
    throw new ApiError(401, "INVALID_ADMIN", "Invalid admin email or password.");
  }
  clearAdminFailures(ip, email);
  try {
    await createAdminClient().from("user_audit_logs").insert({
      user_email: verifiedEmail,
      event: "security.admin_login",
      page_path: "/admin",
      detail: "Authenticated admin portal session started",
      ip,
      user_agent: req.headers.get("user-agent"),
    });
  } catch { /* non-blocking */ }

  const token = await createAdminSessionCookie(verifiedEmail);
  const res = NextResponse.json({ data: { ok: true }, meta: { requestId } }, { status: 200 });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
});
