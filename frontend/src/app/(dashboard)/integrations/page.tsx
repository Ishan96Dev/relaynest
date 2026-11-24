import { publicEnv } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { getIntegrationsData, type IntegrationsPageData } from "@backend/server/services/integrations";
import { IntegrationsHub } from "@/components/integrations/integrations-hub";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  let data: IntegrationsPageData = { demo: true, bots: [], workflows: [], webhookEndpoints: [], integrations: [] };
  try {
    const ctx = await requireAuth();
    data = await getIntegrationsData(ctx);
  } catch {
    /* Demo mode / unauthenticated fallback */
  }

  return <IntegrationsHub initialData={data} appUrl={publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")} />;
}
