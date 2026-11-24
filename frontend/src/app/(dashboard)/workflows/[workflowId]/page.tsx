import { notFound } from "next/navigation";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";
import { ApiError } from "@backend/lib/http/api";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getAutomation, listBotOptions } from "@backend/server/services/automations";
export const metadata = { title: "Workflow Editor" };
export default async function WorkflowPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  // Without a database the editor keeps working as a browser-only sandbox.
  if (!isSupabaseConfigured()) return <WorkflowEditor workflowId={workflowId} />;
  const ctx = await requireAuth();
  const bots = await listBotOptions(ctx);
  if (workflowId === "new") return <WorkflowEditor workflowId="new" persisted bots={bots} />;
  if (!uuid.safeParse(workflowId).success) notFound();
  try {
    return <WorkflowEditor workflowId={workflowId} persisted bots={bots} initial={await getAutomation(ctx, workflowId)} />;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
