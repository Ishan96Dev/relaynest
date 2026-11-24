import { getAdminServicesHealth } from "@backend/server/admin/console";
import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminServicesView } from "@/components/admin/admin-services-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Services | Admin Console" };

export default function AdminServicesPage() {
  return (
    <AdminRouteGate>
      {async () => {
        const initial = await getAdminServicesHealth();
        return <AdminServicesView initial={initial} />;
      }}
    </AdminRouteGate>
  );
}
