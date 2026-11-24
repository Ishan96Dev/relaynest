import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { demoExecutions } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { listExecutions } from "@backend/server/services/workspace-data";

export const metadata = { title: "Execution History" };

export default async function ExecutionsPage() {
  const demo = !isSupabaseConfigured();
  const rows = demo ? [] : await listExecutions();
  const list = demo ? demoExecutions.map((e) => ({ id: e.id, botName: e.botName, trigger: e.trigger, status: e.status, durationMs: e.durationMs as number | null, startedAt: e.startedAt })) : rows.map((e) => ({ ...e, startedAt: new Date(e.startedAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) }));
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Execution History" description="Every run of your bots and automations." />
      <Card>
        {list.length === 0 ? <EmptyState title="No executions yet" description="Executions appear when a bot or automation runs." icon={<Zap className="size-10" />} /> : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2 font-medium">ID</th><th className="font-medium">Bot</th><th className="font-medium">Trigger</th><th className="font-medium">Status</th><th className="font-medium">Duration</th><th className="font-medium">Started</th></tr></thead>
              <tbody>{list.map((e) => (
                <tr key={e.id} className="border-t border-border/60"><td className="py-2.5 font-mono text-xs">{e.id.slice(0, 8)}</td><td>{e.botName}</td><td className="text-muted">{e.trigger}</td>
                  <td><Badge tone={e.status === "succeeded" ? "success" : "danger"} dot>{e.status}</Badge></td><td>{e.durationMs ?? "-"}{e.durationMs !== null && " ms"}</td><td className="text-muted">{e.startedAt}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
