import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { demoExecutions } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { formatUserDateTime } from "@backend/lib/preferences";
import { getUserPreferences } from "@backend/server/services/preferences";
import { listExecutions } from "@backend/server/services/workspace-data";

export const metadata = { title: "Execution History" };

export default async function ExecutionsPage() {
  const demo = !isSupabaseConfigured();
  const [rows, { preferences: prefs }] = await Promise.all([
    demo ? Promise.resolve([]) : listExecutions(),
    getUserPreferences(),
  ]);
  const list = demo
    ? demoExecutions.map((e) => ({
        id: e.id,
        botName: e.botName,
        trigger: e.trigger,
        status: e.status,
        durationMs: e.durationMs as number | null,
        startedAt: e.startedAt,
      }))
    : rows.map((e) => ({
        ...e,
        startedAt: formatUserDateTime(e.startedAt, prefs),
      }));

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Execution History"
        description={`Every run of your bots and automations (${prefs.timezone} · ${prefs.timeFormat}).`}
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState title="No executions yet" description="Executions appear when a bot or automation runs." icon={<Zap className="size-10" />} />
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="rn-table min-w-[640px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Bot</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">{e.id.slice(0, 8)}</td>
                    <td className="font-semibold">{e.botName}</td>
                    <td className="text-muted">{e.trigger}</td>
                    <td><Badge tone={e.status === "succeeded" ? "success" : "danger"} dot>{e.status}</Badge></td>
                    <td className="tabular-nums">{e.durationMs ?? "-"}{e.durationMs !== null && " ms"}</td>
                    <td className="text-muted tabular-nums">{e.startedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
