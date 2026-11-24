import { WorkspaceForm, type MemberView, type WorkspaceView } from "@/components/settings/workspace-form";
import { getSessionUser } from "@backend/server/services/session";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";

export const metadata = { title: "Workspace Settings" };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

export default async function Page() {
  const user = await getSessionUser();
  let workspace: WorkspaceView = { id: "", name: user.workspaceName, slug: "relaynest-team", description: "Core team workspace for building, managing, and automating Telegram bots with RelayNest.", createdAt: "Nov 10, 2026", canEdit: true, isOwner: true, logoPath: null };
  let members: MemberView[] = [
    { id: "1", name: "Ishan Chakraborty", email: "ishan@example.com", role: "owner", joined: "Nov 10, 2026", you: true },
    { id: "2", name: "Pratik Patil", email: "pratik@example.com", role: "admin", joined: "Nov 11, 2026", you: false },
    { id: "3", name: "Sneha Sharma", email: "sneha@example.com", role: "member", joined: "Nov 12, 2026", you: false },
    { id: "4", name: "Rahul Kulkarni", email: "rahul@example.com", role: "viewer", joined: "Nov 12, 2026", you: false },
  ];

  if (isSupabaseConfigured()) {
    const ctx = await requireAuth();
    const [{ data: ws }, { data: rows }] = await Promise.all([
      ctx.supabase.from("workspaces").select("id, name, slug, description, created_at, logo_path").eq("id", ctx.workspaceId).single(),
      ctx.supabase.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ctx.workspaceId).order("created_at"),
    ]);
    const ids = (rows ?? []).map((r) => r.user_id as string);
    const { data: profiles } = ids.length ? await ctx.supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? "Member"]));
    if (ws) {
      workspace = {
        id: ws.id as string, name: ws.name as string, slug: ws.slug as string, description: (ws.description as string | null) ?? "",
        createdAt: fmt(ws.created_at as string), canEdit: ["owner", "admin"].includes(ctx.role), isOwner: ctx.role === "owner", logoPath: (ws.logo_path as string | null) ?? null,
      };
    }
    members = (rows ?? []).map((r) => ({
      id: r.user_id as string, name: names.get(r.user_id as string) ?? "Member", role: r.role as string, joined: fmt(r.created_at as string),
      you: r.user_id === ctx.userId, email: r.user_id === ctx.userId ? ctx.email : undefined,
    }));
  }
  return <WorkspaceForm workspace={workspace} members={members} demo={user.demo} />;
}