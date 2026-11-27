import { Play } from "lucide-react";
import { Playground } from "@/components/ai/playground";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { demoModels, listModels } from "@backend/server/services/ai-models";
import { listCollections } from "@backend/server/services/knowledge";
import { loadSearchProvidersFromDb } from "@backend/server/services/search-providers";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Model Playground" };

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ model?: string; template?: string }> }) {
  const sp = await searchParams;
  const demo = !isSupabaseConfigured();
  const ctx = demo ? null : await requireAuth();
  const [models, collections, searchProviders, sessionUser] = await Promise.all([
    ctx ? listModels(ctx) : Promise.resolve(demoModels()),
    ctx
      ? listCollections(ctx)
          .then((list) => list.map((c) => ({ id: c.id, name: c.name, documents: c.documents })))
          .catch(() => [])
      : Promise.resolve([]),
    loadSearchProvidersFromDb().catch(() => []),
    getSessionUser(),
  ]);
  const playgroundUser = {
    name: sessionUser.name,
    initials: sessionUser.initials,
    avatarUrl: sessionUser.avatarUrl,
    demo: sessionUser.demo,
  };
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader icon={<Play />} title="Model Playground" description="Test any AI model or Agentic AI template live with NSE/BSE/MSE market feeds, open web search, RAG & slash commands." />
      {demo && <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warn">Demo mode: connect Supabase and add your provider API keys to run models.</p>}
      <Playground models={models} initialSlug={sp.model} initialTemplateId={sp.template} collections={collections} searchProviders={searchProviders} user={playgroundUser} />
    </div>
  );
}
