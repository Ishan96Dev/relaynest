import { SecuritySettings } from "@/components/settings/security-settings";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Security & Access" };

export default async function Page() {
  const user = await getSessionUser();
  return <SecuritySettings demo={user.demo} userEmail={user.email} />;
}