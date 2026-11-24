import { BrainCircuit, Send } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AiAgentWizard } from "@/components/bots/ai-agent-wizard";
import { BotWizard } from "@/components/bots/bot-wizard";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { PageTitle } from "@/components/motion/split-text";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { modelSlug } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { canPowerAgent } from "@backend/server/ai/model-catalog";
import { demoModels, listModels } from "@backend/server/services/ai-models";

export const metadata = { title: "Create Your Bot" };

const option = "flex min-w-0 flex-1 items-center gap-4 rounded-2xl border bg-gradient-to-b from-surface to-surface-2 p-4 transition hover:-translate-y-px";

export default async function NewBotPage({ searchParams }: { searchParams: Promise<{ type?: string; model?: string; template?: string }> }) {
  const sp = await searchParams;
  const ai = sp.type === "ai";
  const demo = !isSupabaseConfigured();

  // Models that can power an agent. A model chosen in the catalog arrives as ?model=<slug>; unknown slugs are ignored.
  const all = ai ? (demo ? demoModels() : await listModels(await requireAuth())) : [];
  const models = all.filter(canPowerAgent);
  const imageModels = all.filter((m) => m.modelType === "image_generation");
  const parsed = modelSlug.safeParse(sp.model);
  const preselect = parsed.success && models.some((m) => m.slug === parsed.data) ? parsed.data : null;
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[32px]"><PageTitle text="Create Your Bot" /></h1>
          <p className="mt-1 text-sm text-muted sm:text-[15px]">Choose how you want to build your Telegram bot.</p>
        </div>
        <nav aria-label="Bot type" className="flex flex-1 flex-col gap-3 sm:flex-row xl:max-w-[920px]">
          <Link href="/bots/new" aria-current={!ai ? "true" : undefined} className={cn(option, !ai ? "border-lavender shadow-[0_0_30px_-10px_rgb(var(--rn-primary))]" : "border-border")}>
            <IconTile tone="info" size="xl"><Send /></IconTile>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="text-lg font-bold">Standard Telegram Bot</span><Badge tone="success" className="rounded-full">Available</Badge></span>
              <span className="mt-0.5 block text-sm text-muted">Build a rule-based Telegram bot using commands, custom responses and automation.</span>
            </span>
          </Link>
          <Link href="/bots/new?type=ai" aria-current={ai ? "true" : undefined} className={cn(option, ai ? "border-lavender shadow-[0_0_30px_-10px_rgb(var(--rn-primary))]" : "border-border")}>
            <IconTile tone="primary" size="xl"><BrainCircuit /></IconTile>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="text-lg font-bold">AI Agent Bot</span><Badge tone="success" className="rounded-full">Available</Badge></span>
              <span className="mt-0.5 block text-sm text-muted">Create an intelligent AI-powered Telegram assistant that understands messages and performs tasks.</span>
            </span>
          </Link>
        </nav>
      </div>

      {ai ? <AiAgentWizard demo={demo} models={models} imageModels={imageModels} preselectModel={preselect} initial={null} templateId={sp.template ?? null} /> : <Suspense><BotWizard /></Suspense>}
    </div>
  );
}
