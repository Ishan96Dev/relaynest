import { getAdminAuditData } from "@backend/server/admin/console";
import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminOverviewView } from "@/components/admin/admin-overview-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview | Admin Console" };

export default function AdminPage() {
  return (
    <AdminRouteGate>
      {async () => {
        const initial = await getAdminAuditData();
        return <AdminOverviewView initial={initial} />;
      }}
    </AdminRouteGate>
  );
}
