import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminSecurityView } from "@/components/admin/admin-security-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security & Warnings | Admin Console" };

export default function AdminSecurityPage() {
  return (
    <AdminRouteGate>
      <AdminSecurityView />
    </AdminRouteGate>
  );
}
