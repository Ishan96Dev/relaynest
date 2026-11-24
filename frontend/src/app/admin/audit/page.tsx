import { getAdminAuditData } from "@backend/server/admin/console";
import { AdminAuditView } from "@/components/admin/admin-audit-view";
import { AdminRouteGate } from "@/components/admin/admin-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Trail | Admin Console" };

export default function AdminAuditPage() {
  return (
    <AdminRouteGate>
      {async () => {
        const initial = await getAdminAuditData();
        return <AdminAuditView initial={initial} />;
      }}
    </AdminRouteGate>
  );
}
