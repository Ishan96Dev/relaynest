import { NextResponse } from "next/server";
import { ADMIN_COOKIE, getAdminSession } from "@backend/server/admin/auth";
import { logEvent } from "@backend/server/logger";

export async function POST() {
  const session = await getAdminSession().catch(() => null);
  if (session) logEvent("auth", "info", "Admin logged out", { email: session.email });
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
