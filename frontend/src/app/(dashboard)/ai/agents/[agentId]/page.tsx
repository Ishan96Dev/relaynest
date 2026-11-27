import { ArrowLeft, Bot } from "lucide-react";
import { notFound } from "next/navigation";
import { AiAgentWizard } from "@/components/bots/ai-agent-wizard";
import { PageTitle } from "@/components/motion/split-text";
import { ButtonLink } from "@/components/ui/button";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { canPowerAgent } from "@backend/server/ai/model-catalog";
import { getAiAgent, listKnowledge } from "@backend/server/services/ai-agents";
import { listModels } from "@backend/server/services/ai-models";

export const metadata = { title: "Edit AI Agent" };

export default async function EditAiAgentPage({ params, searchParams }: { params: Promise<{ agentId: string }>; searchParams: Promise<{ step?: string }> }) {
  const [p, sp] = await Promise.all([params, searchParams]);
  const id = uuid.safeParse(p.agentId);
  if (!id.success || !isSupabaseConfigured()) notFound();
  const requested = sp.step === undefined ? null : Math.max(0, Math.min(5, Number.parseInt(sp.step, 10) || 0));
  const ctx = await requireAuth();
  const [agent, knowledge, models] = await Promise.all([
    getAiAgent(ctx, id.data).catch(() => null),
    listKnowledge(ctx, id.data).catch(() => []),
    listModels(ctx),
  ]);
  if (!agent) notFound();
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[32px]"><PageTitle text={agent.name} /></h1>
          <p className="mt-1 text-sm text-muted sm:text-[15px]">Edit your AI agent&apos;s identity, model, instructions, knowledge, and tools. Click Save Changes when ready.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/ai" variant="outline" size="sm"><ArrowLeft className="size-4" aria-hidden />AI Agents</ButtonLink>
          {agent.botId && (
            <ButtonLink href={`/bots/${agent.botId}`} variant="subtle" size="sm"><Bot className="size-4" aria-hidden />Manage in My Bots</ButtonLink>
          )}
        </div>
      </div>
      <AiAgentWizard demo={false} models={models.filter(canPowerAgent)} imageModels={models.filter((m) => m.modelType === "image_generation")} preselectModel={null} initial={{ ...agent, knowledge }} initialStep={requested ?? (agent.botId ? 1 : 0)} />
    </div>
  );
}
