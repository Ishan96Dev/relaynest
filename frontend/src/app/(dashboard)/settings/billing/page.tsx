import { BillingPanel } from "@/components/settings/billing-panel";
import { BillingPreview } from "@/components/settings/billing-preview";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { getBillingOverview } from "@backend/server/billing/service";
export const metadata = { title: "Billing & Subscription" };
export const dynamic = "force-dynamic";
export default async function Page() {
  // Without Supabase there are no accounts to bill, so the sample layout stays.
  if (!isSupabaseConfigured()) return <BillingPreview />;
  const overview = await getBillingOverview(await requireAuth());
  return <BillingPanel initial={overview} />;
}
