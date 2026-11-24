import { Plus } from "lucide-react";
import { AiAgentDrafts } from "@/components/bots/ai-agent-drafts";
import { BotsList } from "@/components/bots/bots-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { listAiAgents } from "@backend/server/services/ai-agents";
import { listBotHistory } from "@backend/server/services/bot-history";
import { syncWorkspaceBotsWithTelegram } from "@backend/server/services/bots";
import { getDashboardData } from "@backend/server/services/dashboard";

export const metadata = { title: "My Bots" };

export default async function BotsPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    try {
      const ctx = await requireAuth();
      await syncWorkspaceBotsWithTelegram(ctx, { timeoutMs: 2_800 });
    } catch {
      // Never block rendering if Telegram check times out or user is unauthenticated.
    }
  }

  const [{ bots }, drafts, history] = await Promise.all([
    getDashboardData(),
    configured ? requireAuth().then(listAiAgents).catch(() => []) : Promise.resolve([]),
    configured ? requireAuth().then(listBotHistory).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="My Bots" description="Manage your Telegram bots, live two-way sync, configuration, and lifecycle history."
        actions={<ButtonLink href="/bots/new"><Plus className="size-4" />Create Bot</ButtonLink>} />
      <AiAgentDrafts agents={drafts} />
      <BotsList bots={bots} initialHistory={history} demo={!configured} />
    </div>
  );
}
