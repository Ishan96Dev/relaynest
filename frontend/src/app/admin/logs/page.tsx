import { getAdminLogsData } from "@backend/server/admin/console";
import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminLogsView } from "@/components/admin/admin-logs-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Console Logs | Admin Console" };

export default function AdminLogsPage() {
  return (
    <AdminRouteGate>
      {async () => {
        const { entries } = await getAdminLogsData("all", "all");
        return <AdminLogsView initial={entries} />;
      }}
    </AdminRouteGate>
  );
}
