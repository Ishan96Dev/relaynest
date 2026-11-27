"use client";
/* Agent avatars are small Supabase Storage images, so next/image optimisation adds nothing. */
/* eslint-disable @next/next/no-img-element */

import { BrainCircuit, ExternalLink, Pencil, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { BUCKETS, publicStorageUrl } from "@backend/lib/supabase/storage";
import type { ModelDto } from "@backend/server/ai/model-catalog";
import type { AiAgentDto } from "@backend/server/services/ai-agents";
import { EditAgentModal } from "@/components/ai/edit-agent-modal";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** AI agents of the workspace, shown on My Bots with inline Edit and full Configure actions. */
export function AiAgentDrafts({
  agents,
  models = [],
  canWrite = true,
  demo = false,
}: {
  agents: AiAgentDto[];
  models?: ModelDto[];
  canWrite?: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(agents);
  const [editing, setEditing] = React.useState<AiAgentDto | null>(null);

  React.useEffect(() => {
    setItems(agents);
  }, [agents]);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="ai-drafts-title" className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="ai-drafts-title" className="text-lg font-bold">AI Agents</h2>
        <Link href="/ai" className="text-sm font-semibold text-lavender hover:underline">View all</Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((a) => {
          const avatar = publicStorageUrl(BUCKETS.avatars, a.avatarPath);
          return (
            <li key={a.id}>
              <Card hover className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/25 text-lavender ring-1 ring-inset ring-primary/40" aria-hidden>
                    {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <BrainCircuit className="size-6" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/ai/agents/${a.id}`} className="block truncate font-bold hover:text-lavender">{a.name}</Link>
                    <p className="truncate text-sm text-muted">@{a.username}</p>
                  </div>
                  <Badge tone={a.status === "active" ? "success" : a.status === "error" ? "danger" : a.status === "draft" ? "warning" : "neutral"} dot className="capitalize">
                    {a.status === "error" ? "Telegram Deleted" : a.status}
                  </Badge>
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-foreground/75">{a.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{a.category}</Badge>
                  {a.modelName && <Badge tone="primary">{a.modelName}</Badge>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {canWrite && (
                    <Button variant="subtle" size="sm" className="flex-1" onClick={() => setEditing(a)}>
                      <Pencil className="size-3.5" aria-hidden />Edit
                    </Button>
                  )}
                  <ButtonLink href={`/ai/agents/${a.id}`} variant="outline" size="sm" className={canWrite ? undefined : "flex-1"}>
                    <SlidersHorizontal className="size-3.5" aria-hidden />Configure
                  </ButtonLink>
                  {a.botId && (
                    <a
                      href={`https://t.me/${a.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${a.name} in Telegram`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-lavender/60"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />Open
                    </a>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <EditAgentModal
        agent={editing}
        models={models}
        demo={demo}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setItems((all) => all.map((x) => (x.id === updated.id ? updated : x)));
          router.refresh();
        }}
      />
    </section>
  );
}
