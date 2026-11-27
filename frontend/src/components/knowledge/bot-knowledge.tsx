"use client";
import { BookOpen, Folder, Loader2 } from "lucide-react";
import * as React from "react";
import type { CollectionDto } from "@backend/server/services/knowledge";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { IconTile } from "@/components/ui/icon-tile";
import { api } from "@/lib/api-client";

/** Knowledge Base collections shared with one bot. Shows assigned documents in each collection. */
export function BotKnowledge({ botId, demo }: { botId: string; demo: boolean }) {
  const [cols, setCols] = React.useState<CollectionDto[] | null>(null);
  const [busyId, setBusyId] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    if (demo) return;
    let live = true;
    void api<CollectionDto[]>("/api/v1/knowledge/collections").then((r) => { if (!live) return; if (r.ok) setCols(r.data); else setError(r.message); });
    return () => { live = false; };
  }, [demo]);
  async function toggle(c: CollectionDto, on: boolean) {
    setBusyId(c.id); setError(undefined);
    const botIds = on ? [...c.botIds, botId] : c.botIds.filter((b) => b !== botId);
    const r = await api(`/api/v1/knowledge/collections/${c.id}/bots`, { method: "PUT", body: { botIds } });
    setBusyId(undefined);
    if (!r.ok) return setError(r.message);
    setCols((all) => all?.map((x) => (x.id === c.id ? { ...x, botIds } : x)) ?? null);
  }
  return (
    <Card>
      <CardHeader title="Knowledge Base" description="Collections this bot can search before it answers." icon={<BookOpen />} action={<ButtonLink href="/knowledge-base" variant="outline" size="sm">Open Knowledge Base</ButtonLink>} />
      <div className="space-y-2.5 p-5 pt-2">
        {demo ? <p className="text-sm text-muted">Demo mode: connect Supabase to share collections with this bot.</p>
          : !cols && !error ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Loading...</p>
          : cols?.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center"><IconTile size="lg"><Folder /></IconTile><p className="max-w-sm text-sm text-muted">There are no collections yet. Create one in the Knowledge Base, then share it with this bot.</p><ButtonLink href="/knowledge-base">Create a collection</ButtonLink></div>
          ) : (
            <>
              <ul className="space-y-2">
                {cols?.map((c) => (
                  <li key={c.id} className="panel space-y-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Checkbox checked={c.botIds.includes(botId)} disabled={busyId === c.id} onChange={(e) => void toggle(c, e.target.checked)} label={<span className="font-semibold">{c.name}<span className="ml-2 text-xs font-normal text-muted">{c.documents} {c.documents === 1 ? "document" : "documents"}</span></span>} />
                      {busyId === c.id && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
                    </div>
                    {c.documentItems?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-7">
                        {c.documentItems.slice(0, 4).map((d) => (
                          <Badge key={d.id} tone="neutral" className="max-w-[180px] truncate text-[10px]">
                            {d.name}
                          </Badge>
                        ))}
                        {c.documentItems.length > 4 && (
                          <span className="text-[11px] text-lavender">+{c.documentItems.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">AI agents and AI bots answer from these collections. Rule-based bots use them when no command or keyword rule matches.</p>
            </>
          )}
        {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
      </div>
    </Card>
  );
}
