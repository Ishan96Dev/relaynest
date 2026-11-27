import { Plus, Sparkles } from "lucide-react";
import { AgentsList } from "@/components/ai/agents-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { canPowerAgent } from "@backend/server/ai/model-catalog";
import { requireAuth } from "@backend/server/auth/context";
import { listAiAgents } from "@backend/server/services/ai-agents";
import { listModels } from "@backend/server/services/ai-models";

export const metadata = { title: "AI Agents" };

export default async function AiAgentsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader icon={<Sparkles />} title="AI Agents" description="Telegram agents powered by AI models, your instructions and your knowledge." />
        <Card className="p-6 text-sm text-muted">Demo mode: connect Supabase to create AI agents.</Card>
      </div>
    );
  }
  const ctx = await requireAuth();
  const [agents, allModels] = await Promise.all([listAiAgents(ctx), listModels(ctx).catch(() => [])]);
  const models = allModels.filter(canPowerAgent);
  const canWrite = ctx.role === "owner" || ctx.role === "admin";
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader icon={<Sparkles />} title="AI Agents" description="Telegram agents powered by AI models, your instructions and your knowledge."
        actions={canWrite ? <ButtonLink href="/bots/new?type=ai"><Plus className="size-4" aria-hidden />Create AI Agent</ButtonLink> : undefined} />
      <AgentsList agents={agents} models={models} canWrite={canWrite} />
    </div>
  );
}
