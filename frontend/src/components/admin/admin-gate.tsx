import { adminConfigured, getAdminSession } from "@backend/server/admin/auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminShell } from "@/components/admin/admin-shell";

/** Renders the app-style AdminLogin screen when unauthenticated, or wraps the subpage in AdminShell. */
export async function AdminRouteGate({
  children,
}: {
  children: React.ReactNode | (() => Promise<React.ReactNode>);
}) {
  const session = await getAdminSession();
  if (!session) {
    return <AdminLogin configured={await adminConfigured()} />;
  }
  const content = typeof children === "function" ? await children() : children;
  return <AdminShell adminEmail={session.email}>{content}</AdminShell>;
}
