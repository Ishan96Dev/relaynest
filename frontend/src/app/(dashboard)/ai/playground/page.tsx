import { Play } from "lucide-react";
import { Playground } from "@/components/ai/playground";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { demoModels, listModels } from "@backend/server/services/ai-models";
import { listCollections } from "@backend/server/services/knowledge";

export const metadata = { title: "Model Playground" };

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  const sp = await searchParams;
  const demo = !isSupabaseConfigured();
  const ctx = demo ? null : await requireAuth();
  const models = ctx ? await listModels(ctx) : demoModels();
  const collections = ctx ? (await listCollections(ctx).catch(() => [])).map((c) => ({ id: c.id, name: c.name, documents: c.documents })) : [];
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader icon={<Play />} title="Model Playground" description="Try any model in the catalog: chat, embeddings, image generation and decisions." />
      {demo && <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warn">Demo mode: connect Supabase and add your provider API keys to run models.</p>}
      <Playground models={models} initialSlug={sp.model} collections={collections} />
    </div>
  );
}
