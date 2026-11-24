import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import type { AiAgentDto } from "@backend/server/services/ai-agents";

/** AI agents of the workspace, shown on My Bots. */
export function AiAgentDrafts({ agents }: { agents: AiAgentDto[] }) {
  if (agents.length === 0) return null;
  return (
    <section aria-labelledby="ai-drafts-title" className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="ai-drafts-title" className="text-lg font-bold">AI Agents</h2>
        <Link href="/ai" className="text-sm font-semibold text-lavender hover:underline">View all</Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {agents.map((a) => (
          <li key={a.id}>
            <Card className="flex items-start gap-3 p-4">
              <IconTile tone="primary" size="lg"><BrainCircuit /></IconTile>
              <div className="min-w-0 flex-1">
                <Link href={`/ai/agents/${a.id}`} className="block truncate font-bold hover:text-lavender">{a.name}</Link>
                <p className="truncate text-sm text-muted">@{a.username}</p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground/75">{a.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={a.status === "active" ? "success" : a.status === "error" ? "danger" : a.status === "draft" ? "warning" : "neutral"} dot className="capitalize">{a.status === "error" ? "Telegram Deleted" : a.status}</Badge>
                  <Badge tone="neutral">{a.category}</Badge>
                  {a.modelName && <Badge tone="primary">{a.modelName}</Badge>}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
