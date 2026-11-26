import { NotificationSettings } from "@/components/settings/notification-settings";
import { getNotificationSettings } from "@backend/server/services/notification-settings";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Notifications" };

export default async function Page() {
  const [user, record] = await Promise.all([getSessionUser(), getNotificationSettings()]);
  return (
    <NotificationSettings
      initialSettings={record.settings}
      initialUpdatedAt={record.updatedAt}
      demo={user.demo}
    />
  );
}
