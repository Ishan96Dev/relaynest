import { Plus } from "lucide-react";
import { AiAgentDrafts } from "@/components/bots/ai-agent-drafts";
import { BotsList } from "@/components/bots/bots-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { canPowerAgent } from "@backend/server/ai/model-catalog";
import { requireAuth } from "@backend/server/auth/context";
import { listAiAgents } from "@backend/server/services/ai-agents";
import { listModels } from "@backend/server/services/ai-models";
import { listBotHistory } from "@backend/server/services/bot-history";
import { syncWorkspaceBotsWithTelegram } from "@backend/server/services/bots";
import { getDashboardData } from "@backend/server/services/dashboard";

export const metadata = { title: "My Bots" };

export default async function BotsPage() {
  const configured = isSupabaseConfigured();
  let canWrite = true;
  if (configured) {
    try {
      const ctx = await requireAuth();
      canWrite = ctx.role === "owner" || ctx.role === "admin";
      await syncWorkspaceBotsWithTelegram(ctx, { timeoutMs: 2_800 });
    } catch {
      // Never block rendering if Telegram check times out or user is unauthenticated.
    }
  }

  const [{ bots }, agents, history, models] = await Promise.all([
    getDashboardData(),
    configured ? requireAuth().then(listAiAgents).catch(() => []) : Promise.resolve([]),
    configured ? requireAuth().then(listBotHistory).catch(() => []) : Promise.resolve([]),
    configured ? requireAuth().then((c) => listModels(c).then((all) => all.filter(canPowerAgent))).catch(() => []) : Promise.resolve([]),
  ]);

  const agentByBotId = new Map(agents.filter((a) => a.botId).map((a) => [a.botId!, a]));
  const enrichedBots = bots.map((b) => {
    const linked = agentByBotId.get(b.id);
    return linked
      ? {
          ...b,
          linkedAgentId: linked.id,
          linkedAgentModelName: linked.modelName,
          linkedAgentStatus: linked.status,
        }
      : b;
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="My Bots" description="Manage your Telegram bots, live two-way sync, configuration, and lifecycle history."
        actions={<ButtonLink href="/bots/new"><Plus className="size-4" />Create Bot</ButtonLink>} />
      <AiAgentDrafts agents={agents} models={models} canWrite={canWrite} demo={!configured} />
      <BotsList bots={enrichedBots} initialHistory={history} canWrite={canWrite} demo={!configured} />
    </div>
  );
}
