import { AdminRouteGate } from "@/components/admin/admin-gate";
import { AdminKeysView } from "@/components/admin/admin-keys-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keys & Tokens | Admin Console" };

export default function AdminKeysPage() {
  return (
    <AdminRouteGate>
      <AdminKeysView />
    </AdminRouteGate>
  );
}
