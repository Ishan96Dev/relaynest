import { getAdminAuditData } from "@backend/server/admin/console";
import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminUsersView } from "@/components/admin/admin-users-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "User Records | Admin Console" };

export default function AdminUsersPage() {
  return (
    <AdminRouteGate>
      {async () => {
        const data = await getAdminAuditData();
        return <AdminUsersView initialUsers={data.users} />;
      }}
    </AdminRouteGate>
  );
}
