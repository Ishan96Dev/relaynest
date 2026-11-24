import { ProfileForm } from "@/components/settings/profile-form";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Profile" };

export default async function Page() {
  return <ProfileForm user={await getSessionUser()} />;
}