import { parseTriggerInfo, type ExecutionSummaryItem } from "@backend/lib/execution-format";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { getUserPreferences } from "@backend/server/services/preferences";
import { listExecutions } from "@backend/server/services/workspace-data";
import { ExecutionsTable } from "@/components/analytics/executions-table";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { demoExecutions } from "@/lib/demo-data";

export const metadata = { title: "Execution History" };

export default async function ExecutionsPage() {
  const demo = !isSupabaseConfigured();
  const [rows, { preferences: prefs }] = await Promise.all([
    demo ? Promise.resolve([]) : listExecutions(100),
    getUserPreferences(),
  ]);

  const list: ExecutionSummaryItem[] = demo
    ? demoExecutions.map((e) => {
        const info = parseTriggerInfo(e.trigger);
        return {
          id: e.id,
          botId: null,
          botName: e.botName,
          botUsername: null,
          workflowId: null,
          workflowName: null,
          triggerType: e.trigger,
          triggerLabel: info.label,
          triggerCategory: info.category,
          status: e.status,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          durationMs: e.durationMs,
          errorCode: null,
          errorMessage: null,
          inputPreview: null,
          outputPreview: null,
          actorLabel: null,
          chatId: null,
          modelLabel: null,
          providerSource: null,
          totalTokens: 0,
          costUsd: 0,
          stepCount: 0,
          hasRecordedSteps: false,
        };
      })
    : rows;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Execution History"
        description={`Every run of your bots and automations (${prefs.timezone} · ${prefs.timeFormat}). Click any execution to view its full journey modal.`}
      />
      <Card className="p-5">
        <ExecutionsTable items={list} demo={demo} />
      </Card>
    </div>
  );
}
