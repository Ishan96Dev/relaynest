import { cookies } from "next/headers";
import { NextResponse, after, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@backend/lib/env/public";
import { getSupabase } from "@backend/server/auth/identity";
import { recordUserAudit } from "@backend/server/audit";

/** Responds immediately: session cookies are cleared now, and the token is revoked with Supabase after the response. */
export async function POST(req: NextRequest) {
  const wantsJson = req.headers.get("accept")?.includes("application/json");
  const transitionUrl = new URL("/auth/transition?mode=signout&next=/login", req.url);
  const res = wantsJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(transitionUrl, { status: 303 });
  if (!isSupabaseConfigured()) return res;

  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const user = data.session?.user;
  if (user) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip");
    const ua = req.headers.get("user-agent");
    after(() => recordUserAudit({ userId: user.id, userEmail: user.email, event: "auth.logout", detail: "User signed out", ip, userAgent: ua }));
  }

  for (const c of (await cookies()).getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  if (token) {
    const env = publicEnv();
    after(() =>
      fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${token}` },
      }).catch(() => undefined),
    );
  }
  return res;
}