import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUserPreferences } from "@backend/server/services/preferences";
import { getSessionUser } from "@backend/server/services/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, prefRecord] = await Promise.all([getSessionUser(), getUserPreferences()]);
  return (
    <DashboardShell
      user={user}
      initialPreferences={prefRecord.preferences}
      initialPreferencesUpdatedAt={prefRecord.updatedAt}
    >
      {children}
    </DashboardShell>
  );
}
