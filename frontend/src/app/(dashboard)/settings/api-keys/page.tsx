import { publicEnv } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { listApiKeysPageData, type ApiKeysPageData } from "@backend/server/services/api-keys";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

export const metadata = { title: "API Keys" };
export const dynamic = "force-dynamic";

export default async function Page() {
  let data: ApiKeysPageData = {
    demo: true,
    keys: [],
    stats: {
      totalKeys: 0,
      activeKeys: 0,
      revokedKeys: 0,
      lastRequestAt: null,
      totalRequests7d: 0,
      successfulRequests7d: 0,
      failedRequests7d: 0,
    },
    usage7d: [],
    recentLogs: [],
  };

  try {
    const ctx = await requireAuth();
    data = await listApiKeysPageData(ctx);
  } catch {
    /* Demo / unauthenticated fallback handled gracefully */
  }

  return <ApiKeysManager initialData={data} appUrl={publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")} />;
}
