import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminLogsView } from "@/components/admin/admin-logs-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Console Logs | Admin Console" };

export default function AdminLogsPage() {
  return (
    <AdminRouteGate>
      <AdminLogsView />
    </AdminRouteGate>
  );
}
