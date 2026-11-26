import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { landingPathFor } from "@backend/lib/preferences";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { createClient } from "@backend/lib/supabase/server";
import { recordUserAudit } from "@backend/server/audit";
import { notify } from "@backend/server/notifications";
import { getUserPreferencesForUserId } from "@backend/server/services/preferences";

/** Completes email-link flows (signup confirm, password recovery). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");
  if (code && isSupabaseConfigured()) {
    const sb = await createClient();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      let defaultDest = "/dashboard";
      if (!rawNext && data.user?.id) {
        const prefs = await getUserPreferencesForUserId(data.user.id);
        defaultDest = landingPathFor(prefs.landing);
      }
      const next = safeRedirectPath(rawNext, defaultDest);
      await recordUserAudit({
        userId: data.user?.id,
        userEmail: data.user?.email,
        event: "auth.login",
        pagePath: next,
        detail: "Email link / OAuth callback sign-in",
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip"),
        userAgent: req.headers.get("user-agent"),
      });
      const createdAt = data.user?.created_at ? Date.parse(data.user.created_at) : 0;
      const isNew = createdAt > 0 && Date.now() - createdAt < 5 * 60_000;
      if (!isNew && data.user?.id) {
        void (async () => {
          const { data: member } = await createAdminClient()
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", data.user!.id)
            .limit(1)
            .maybeSingle();
          if (member?.workspace_id) {
            await notify({
              workspaceId: member.workspace_id as string,
              userId: data.user!.id,
              kind: "login_detected",
              title: "New sign-in detected",
              body: "You signed in to your RelayNest account via OAuth or email link.",
              emailKey: "login",
              dedupeHours: 1,
              metadata: { method: "callback" },
            });
          }
        })().catch(() => undefined);
      }
      const name =
        (data.user?.user_metadata?.full_name as string | undefined) ||
        (data.user?.user_metadata?.name as string | undefined) ||
        data.user?.email?.split("@")[0] ||
        "";
      const transition = new URL("/auth/transition", url.origin);
      transition.searchParams.set("mode", isNew ? "signup" : "signin");
      if (name) transition.searchParams.set("name", name);
      transition.searchParams.set("next", next);
      return NextResponse.redirect(transition);
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
