import { Plus, Workflow } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { listAgents } from "@backend/server/services/workspace-data";

export const metadata = { title: "Automations" };

const tone = (s: string) => (s === "active" ? "success" : s === "error" ? "danger" : s === "draft" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";
export default async function AgentsPage() {
  const demo = !isSupabaseConfigured();
  const agents = demo ? [] : await listAgents();
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Automations" description="Build trigger, condition and action workflows for your bots."
        actions={<ButtonLink href="/workflows/new"><Plus className="size-4" />Create Automation</ButtonLink>} />
      {demo ? (
        <Card className="p-5">
          <Link href="/workflows/demo" className="flex items-center gap-4">
            <span className="grid-cols-1 grid size-12 place-items-center rounded-xl bg-primary/15 text-secondary" aria-hidden><Workflow className="size-6" /></span>
            <div className="flex-1"><p className="font-semibold">Welcome Flow</p><p className="text-sm text-muted">Send a welcome message when a user starts the bot.</p></div>
            <Badge tone="warning">Draft</Badge>
          </Link>
        </Card>
      ) : agents.length > 0 ? (
        <Card className="divide-y divide-border/60">
          {agents.map((a) => (
            <Link key={a.id} href={a.workflowId ? `/workflows/${a.workflowId}` : "/workflows/new"} className="flex items-center gap-4 p-5 transition hover:bg-primary/5">
              <span className="grid-cols-1 grid size-12 place-items-center rounded-xl bg-primary/15 text-secondary" aria-hidden><Workflow className="size-6" /></span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.name}</p><p className="truncate text-sm text-muted">{a.description || "No description"}</p></div>
              <Badge tone={tone(a.status)} dot className="capitalize">{a.status}</Badge>
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="p-10 text-center">
          <Workflow className="mx-auto size-10 text-secondary" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">No automations yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Create your first workflow to react to Telegram messages, webhooks or schedules.</p>
        </Card>
      )}
    </div>
  );
}
