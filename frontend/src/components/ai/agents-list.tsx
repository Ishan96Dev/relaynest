"use client";
/* Agent avatars are small Supabase Storage images, so next/image optimisation adds nothing. */
/* eslint-disable @next/next/no-img-element */
import { BrainCircuit, ExternalLink, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import type { AiAgentDto } from "@backend/server/services/ai-agents";
import { publicStorageUrl, BUCKETS } from "@backend/lib/supabase/storage";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api-client";

const tone = (s: string) => (s === "active" ? "success" : s === "error" ? "danger" : s === "draft" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";

export function AgentsList({ agents: initial, canWrite }: { agents: AiAgentDto[]; canWrite: boolean }) {
  const router = useRouter();
  const [agents, setAgents] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const setError = (m?: string) => { if (m) toast.error(m); };
  const [removing, setRemoving] = React.useState<AiAgentDto | null>(null);

  async function toggle(a: AiAgentDto) {
    setBusy(a.id); setError(undefined);
    const r = await api<AiAgentDto>(`/api/v1/ai-agents/${a.id}/${a.status === "active" ? "deactivate" : "activate"}`, { method: "POST", body: {} });
    setBusy(null);
    if (!r.ok) return setError(`${a.name}: ${r.message}`);
    setAgents((all) => all.map((x) => (x.id === a.id ? r.data : x)));
    toast.success(a.status === "active" ? `${a.name} paused` : `${a.name} activated`);
    router.refresh();
  }

  async function remove(a: AiAgentDto) {
    setBusy(a.id); setError(undefined);
    const r = await api<void>(`/api/v1/ai-agents/${a.id}`, { method: "DELETE" });
    setBusy(null); setRemoving(null);
    if (!r.ok) return setError(r.message);
    setAgents((all) => all.filter((x) => x.id !== a.id));
    toast.success(`${a.name} deleted`);
    router.refresh();
  }

  if (agents.length === 0) {
    return (
      <Card>
        <EmptyState title="No AI agents yet" description="Create an AI agent to answer Telegram messages with a model, instructions and your own knowledge."
          image={{ src: "/images/illustrations/ai-agents.png", width: 199, height: 146 }} icon={<BrainCircuit className="size-10" />}
          action={canWrite ? <ButtonLink href="/bots/new?type=ai"><Plus className="size-4" aria-hidden />Create AI Agent</ButtonLink> : undefined} />
      </Card>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {agents.map((a) => {
          const avatar = publicStorageUrl(BUCKETS.avatars, a.avatarPath);
          return (
            <li key={a.id}>
              <Card hover className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/25 text-lavender ring-1 ring-inset ring-primary/40" aria-hidden>
                    {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <BrainCircuit className="size-6" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/ai/agents/${a.id}`} className="block truncate text-lg font-bold hover:text-lavender">{a.name}</Link>
                    <p className="truncate text-sm text-foreground/75">@{a.username}</p>
                  </div>
                  <Badge tone={tone(a.status)} dot className="capitalize">{a.status}</Badge>
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-foreground/75">{a.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{a.category}</Badge>
                  <Badge tone={a.modelName ? "primary" : "warning"}>{a.modelName ?? "No model yet"}</Badge>
                  {!a.botId && <Badge tone="warning">Telegram not connected</Badge>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <ButtonLink href={`/ai/agents/${a.id}`} variant="subtle" size="sm" className="flex-1"><Pencil className="size-3.5" aria-hidden />Configure</ButtonLink>
                  {canWrite && a.botId && a.modelSlug && (
                    <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => toggle(a)}>
                      {a.status === "active" ? <Power className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}{a.status === "active" ? "Pause" : "Activate"}
                    </Button>
                  )}
                  {a.botId && <a href={`https://t.me/${a.username}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.name} in Telegram`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-lavender/60"><ExternalLink className="size-3.5" aria-hidden />Open</a>}
                  {canWrite && <Button variant="danger-outline" size="sm" aria-label={`Delete ${a.name}`} onClick={() => setRemoving(a)}><Trash2 className="size-3.5" aria-hidden /></Button>}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? "agent"}?`}
        footer={<><Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={busy !== null} onClick={() => removing && remove(removing)}>Delete</Button></>}>
        This removes the agent, its knowledge and chat memory, and disconnects its Telegram bot. This cannot be undone.
      </Modal>
    </>
  );
}
