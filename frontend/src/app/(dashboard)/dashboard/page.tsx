import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@backend/server/services/dashboard";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const [d, user] = await Promise.all([getDashboardData(), getSessionUser()]);
  const first = user.name.split(" ")[0] ?? "";
  return <DashboardView data={d} firstName={first} demoUser={user.demo} />;
}
