import { BookOpen } from "lucide-react";
import { KnowledgeBase } from "@/components/knowledge/knowledge-base";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { requireAuth } from "@backend/server/auth/context";
import { knowledgeStatus, listCollections, listDocuments, listLinkableBots } from "@backend/server/services/knowledge";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgeBasePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader icon={<BookOpen />} title="Knowledge Base" description="Organize documents and knowledge sources for your bots." />
        <Card className="p-6 text-sm text-muted">Demo mode: connect Supabase to upload documents and share them with your bots.</Card>
      </div>
    );
  }
  const ctx = await requireAuth();
  const [collections, documents, bots, status] = await Promise.all([listCollections(ctx), listDocuments(ctx), listLinkableBots(ctx), knowledgeStatus()]);
  return <KnowledgeBase collections={collections} documents={documents} bots={bots} status={status} canWrite={ctx.role === "owner" || ctx.role === "admin"} />;
}
