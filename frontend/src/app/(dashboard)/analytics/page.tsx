import { Zap } from "lucide-react";
import Link from "next/link";
import { AiUsageSection } from "@/components/analytics/ai-usage-section";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { LiveAnalytics } from "@/components/analytics/live-analytics";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { getAiUsage } from "@backend/server/services/ai-usage";
import { getAnalytics } from "@backend/server/services/workspace-data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  if (!isSupabaseConfigured()) return <AnalyticsView />;
  const { range } = await searchParams;
  const days = Number(range) === 30 ? 30 : 7;
  const [a, ai] = await Promise.all([getAnalytics(days), getAiUsage(undefined, days)]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div className="space-y-6">
        <PageHeader
          title="Analytics & Insights"
          description={`Track performance, usage, and automation insights for your Telegram bots. Last ${days} days.`}
          actions={
            <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold">
              <Link href="/analytics?range=7" className={cn("rounded-md px-3 py-1.5", days === 7 ? "btn-primary-bg text-white" : "text-muted hover:text-foreground")}>Last 7 Days</Link>
              <Link href="/analytics?range=30" className={cn("rounded-md px-3 py-1.5", days === 30 ? "btn-primary-bg text-white" : "text-muted hover:text-foreground")}>Last 30 Days</Link>
            </div>
          }
        />
        {a.total === 0 ? (
          <Card><EmptyState title="No execution data yet" description="Analytics appear once your bots or workflows start running." icon={<Zap className="size-10" />} /></Card>
        ) : (
          <LiveAnalytics a={a} />
        )}
      </div>
      <AiUsageSection data={ai} />
    </div>
  );
}
