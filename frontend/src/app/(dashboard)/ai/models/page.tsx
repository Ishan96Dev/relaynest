import { Box } from "lucide-react";
import { ModelCatalog } from "@/components/ai/model-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { demoModels, listModels } from "@backend/server/services/ai-models";

export const metadata = { title: "AI Model Catalog" };

export default async function ModelCatalogPage() {
  const demo = !isSupabaseConfigured();
  const models = demo ? demoModels() : await listModels(await requireAuth());
  return (
    <div className="mx-auto max-w-[1700px]">
      <PageHeader
        icon={<Box />}
        title="AI Model Catalog"
        description="Discover AI models for reasoning, coding, chat, embeddings and multimodal applications."
      />
      <ModelCatalog models={models} demo={demo} />
    </div>
  );
}
