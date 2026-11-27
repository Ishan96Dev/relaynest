"use client";

import {
  AlertTriangle, Bot as BotIcon, CheckCircle2, Clock, ExternalLink, History, LayoutGrid,
  MessageSquare, Pencil, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, Wifi, Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { formatUserDate, type UserPreferences } from "@backend/lib/preferences";
import { BotAvatar } from "@/components/bots/bot-avatar";
import { EditBotModal } from "@/components/bots/edit-bot-modal";
import { StatusBadge } from "@/components/bots/status-badge";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page-header";
import { toast } from "@/components/ui/toast";
import type { Bot, BotHistoryEntry } from "@/types";

function relTime(iso: string | null, prefs?: Pick<UserPreferences, "dateFormat" | "timezone" | "language">) {
  if (!iso) return "Just now";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  return prefs ? formatUserDate(iso, prefs) : new Date(iso).toLocaleDateString();
}

export function BotsList({
  bots,
  initialHistory = [],
  canWrite = true,
  demo = false,
}: {
  bots: Bot[];
  initialHistory?: BotHistoryEntry[];
  canWrite?: boolean;
  demo?: boolean;
}) {
  const { prefs } = usePreferences();
  const router = useRouter();
  const [items, setItems] = React.useState(bots);
  const [history, setHistory] = React.useState(initialHistory);
  const [historyFilter, setHistoryFilter] = React.useState<"all" | "created" | "updated" | "deleted">("all");
  const [q, setQ] = React.useState("");
  const defaultStatus = prefs.botView === "Active Bots" ? "active" : "all";
  const [status, setStatus] = React.useState(defaultStatus);
  const userChangedFilter = React.useRef(false);
  const [sort, setSort] = React.useState("recent");
  const [syncing, setSyncing] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Bot | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Bot | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => { setItems(bots); }, [bots]);
  React.useEffect(() => { setHistory(initialHistory); }, [initialHistory]);
  React.useEffect(() => {
    if (!userChangedFilter.current) setStatus(prefs.botView === "Active Bots" ? "active" : "all");
  }, [prefs.botView]);

  const rows = React.useMemo(() => {
    const f = items.filter((b) => (status === "all" || b.status === status) && (b.name + b.username).toLowerCase().includes(q.toLowerCase()));
    return sort === "name" ? [...f].sort((a, b) => a.name.localeCompare(b.name)) : f;
  }, [items, q, status, sort]);

  const deletedOnTelegramBots = React.useMemo(
    () => items.filter((b) => b.webhookStatus === "telegram_deleted"),
    [items],
  );

  const activeCount = items.filter((b) => b.status === "active").length;
  const connectedCount = items.filter((b) => b.webhookStatus === "registered" || b.webhookStatus === "polling").length;
  const totalMsgs = items.reduce((n, b) => n + b.messages, 0);

  const visibleHistory = React.useMemo(
    () =>
      history.filter((h) =>
        historyFilter === "all"
          ? true
          : historyFilter === "deleted"
            ? h.event === "deleted" || h.event === "deleted_on_telegram"
            : h.event === historyFilter,
      ),
    [history, historyFilter],
  );

  async function refreshHistory() {
    if (demo) return;
    const res = await fetch("/api/v1/bots/history");
    const j = await res.json().catch(() => null);
    if (res.ok && Array.isArray(j?.data)) setHistory(j.data as BotHistoryEntry[]);
  }

  async function syncWithTelegram() {
    if (demo) {
      toast.info("Demo mode: connect Supabase to verify live Telegram bot tokens.");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/v1/bots/sync", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(j?.error?.message ?? "Could not sync bots with Telegram.");
        return;
      }
      const nextBots = (j.data?.bots ?? []) as Array<{
        id: string; publicId: string; name: string; description: string | null; category: string | null;
        username: string | null; avatarPath: string | null; status: Bot["status"]; webhookStatus: Bot["webhookStatus"];
        welcomeMessage: string | null; defaultResponse: string | null; messagesCount: number; activeUsers?: number; executionsCount?: number; lastUpdateAt: string | null; createdAt: string;
      }>;
      setItems((prev) => {
        const prevMap = new Map(prev.map((x) => [x.id, x]));
        return nextBots.map((b) => {
          const old = prevMap.get(b.id);
          return {
            id: b.id, publicId: b.publicId, name: b.name, username: b.username ?? "", avatarPath: b.avatarPath,
            description: b.description ?? "", welcomeMessage: b.welcomeMessage ?? "", defaultResponse: b.defaultResponse ?? "",
            status: b.status, webhookStatus: b.webhookStatus, messages: b.messagesCount, activeUsers: b.activeUsers ?? 0, executionsCount: b.executionsCount,
            lastActive: b.lastUpdateAt ? relTime(b.lastUpdateAt) : "No activity yet", category: b.category ?? "",
            createdAt: new Date(b.createdAt).toLocaleDateString(),
            linkedAgentId: old?.linkedAgentId ?? null,
            linkedAgentModelName: old?.linkedAgentModelName ?? null,
            linkedAgentStatus: old?.linkedAgentStatus ?? null,
          };
        });
      });
      await refreshHistory();
      const deletedCount = ((j.data?.syncResults ?? []) as { telegramDeleted: boolean }[]).filter((r) => r.telegramDeleted).length;
      if (deletedCount > 0) {
        toast.error(`${deletedCount} bot${deletedCount > 1 ? "s were" : " was"} deleted on Telegram. Delete ${deletedCount > 1 ? "them" : "it"} cleanly and recreate if needed.`);
      } else {
        toast.success("All bots verified live with Telegram");
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function confirmRemoveBot() {
    if (!deleteTarget) return;
    if (demo) {
      toast.error("Demo mode: connect Supabase to remove bots.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/bots/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error?.message ?? "Failed to delete bot.");
        return;
      }
      setItems((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      toast.success(`Deleted "${deleteTarget.name}" and cleaned up Telegram configuration`);
      setDeleteTarget(null);
      await refreshHistory();
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {deletedOnTelegramBots.length > 0 && (
        <div role="alert" className="rn-callout p-4 sm:p-5" data-tone="danger">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <IconTile tone="danger" size="lg" className="shrink-0">
                <AlertTriangle className="animate-pulse" />
              </IconTile>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-bad">
                    Critical Sync Warning
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {deletedOnTelegramBots.length} {deletedOnTelegramBots.length === 1 ? "bot" : "bots"} affected
                  </span>
                </div>
                <h2 className="mt-1.5 text-base font-extrabold text-foreground">
                  Bot Deleted on Telegram: {deletedOnTelegramBots.map((b) => b.name).join(", ")}
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-foreground/85">
                  Telegram reports that {deletedOnTelegramBots.length === 1 ? "this bot was" : "these bots were"} deleted or had{" "}
                  {deletedOnTelegramBots.length === 1 ? "its" : "their"} token revoked in <span className="font-semibold">@BotFather</span>.
                  Please delete {deletedOnTelegramBots.length === 1 ? "the bot" : "them"} from RelayNest now and recreate or connect a new bot if required.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget(deletedOnTelegramBots[0] ?? null)}>
                <Trash2 className="size-4" />Delete Bot Now
              </Button>
              <ButtonLink href="/bots/new" variant="outline" size="sm">
                <Plus className="size-4" />Recreate Bot
              </ButtonLink>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card flex items-center gap-3 p-4">
            <IconTile tone="primary" size="lg"><BotIcon /></IconTile>
            <div><p className="text-xs text-muted">Total Bots</p><p className="text-2xl font-extrabold tabular-nums">{items.length}</p></div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <IconTile tone="success" size="lg"><Zap /></IconTile>
            <div><p className="text-xs text-muted">Active Bots</p><p className="text-2xl font-extrabold tabular-nums">{activeCount}</p></div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <IconTile tone="info" size="lg"><Wifi /></IconTile>
            <div><p className="text-xs text-muted">Connected</p><p className="text-2xl font-extrabold tabular-nums">{connectedCount}</p></div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <IconTile tone="primary" size="lg"><MessageSquare /></IconTile>
            <div><p className="text-xs text-muted">Messages Processed</p><p className="text-2xl font-extrabold tabular-nums">{totalMsgs.toLocaleString()}</p></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_170px_170px_auto]">
        <Input aria-label="Search bots" icon={<Search />} placeholder="Search bots..." className="h-11" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Filter by status" className="h-11" value={status} onChange={(e) => { userChangedFilter.current = true; setStatus(e.target.value); }}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Paused</option><option value="draft">Draft</option><option value="error">Error / Sync Alert</option>
        </Select>
        <Select aria-label="Sort bots" className="h-11" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Recent activity</option><option value="name">Name</option></Select>
        <Button variant="outline" className="h-11" onClick={syncWithTelegram} disabled={syncing} title="Check live status with Telegram for every bot in your workspace">
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? "Syncing..." : "Sync Telegram"}</span>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={items.length ? "No bots match your filters" : "You haven't created any bots yet."}
            description={items.length ? "Try a different search or status." : "Connect a Telegram bot token from BotFather to get started."}
            image={items.length ? undefined : { src: "/images/illustrations/empty-box.png", width: 199, height: 146 }}
            icon={<Search className="size-10" />}
            action={!items.length ? <ButtonLink href="/bots/new"><Plus className="size-4" />Create Your First Bot</ButtonLink> : undefined}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((b) => {
            const tgDeleted = b.webhookStatus === "telegram_deleted";
            return (
              <li key={b.id}>
                <Card
                  hover
                  className={`flex h-full flex-col p-5 ${tgDeleted ? "border-danger/60 bg-danger/5 shadow-[0_0_24px_-10px_rgb(var(--rn-danger))]" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <BotAvatar name={b.name} avatarPath={b.avatarPath} className="size-12 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/bots/${b.id}`} className="block truncate text-lg font-bold hover:text-lavender">{b.name}</Link>
                      <p className="truncate text-sm text-foreground/75">{b.username ? `@${b.username}` : "Not connected"}</p>
                    </div>
                    {tgDeleted ? (
                      <Badge tone="danger" dot>Deleted on Telegram</Badge>
                    ) : (
                      <StatusBadge status={b.status} />
                    )}
                  </div>

                  {tgDeleted ? (
                    <div className="mt-3 rounded-xl border border-danger/45 bg-danger/10 p-3 text-xs text-foreground/90">
                      <p className="font-bold text-bad">Bot deleted or revoked on Telegram</p>
                      <p className="mt-0.5 text-foreground/75">Delete this entry now and recreate or link a new Telegram bot if needed.</p>
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 line-clamp-2 min-h-10 text-sm text-foreground/75">{b.description || "No description yet."}</p>
                      {(b.category || b.linkedAgentId) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {b.category && <Badge tone="neutral">{b.category}</Badge>}
                          {b.linkedAgentId && (
                            <Badge tone="primary">
                              <Sparkles className="size-3" aria-hidden />
                              {b.linkedAgentModelName ? b.linkedAgentModelName : "AI Agent"}
                            </Badge>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="panel p-2"><dt className="text-muted">Messages</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{b.messages.toLocaleString()}</dd></div>
                    <div className="panel p-2">
                      <dt className="text-muted">Sync</dt>
                      <dd className="mt-0.5">
                        <Badge tone={tgDeleted ? "danger" : b.webhookStatus === "registered" || b.webhookStatus === "polling" ? "success" : "neutral"}>
                          {tgDeleted ? "Deleted" : b.webhookStatus}
                        </Badge>
                      </dd>
                    </div>
                    <div className="panel p-2"><dt className="text-muted">Last active</dt><dd className="mt-0.5 truncate text-sm font-bold">{b.lastActive}</dd></div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {tgDeleted ? (
                      <>
                        <Button variant="danger" size="sm" className="flex-1" onClick={() => setDeleteTarget(b)}>
                          <Trash2 className="size-3.5" />Delete Now
                        </Button>
                        <ButtonLink href="/bots/new" variant="outline" size="sm">
                          <Plus className="size-3.5" />Recreate
                        </ButtonLink>
                      </>
                    ) : (
                      <>
                        {canWrite && (
                          <Button variant="subtle" size="sm" className="flex-1" onClick={() => setEditTarget(b)}>
                            <Pencil className="size-3.5" aria-hidden />Edit
                          </Button>
                        )}
                        <ButtonLink href={`/bots/${b.id}`} variant="outline" size="sm" className={canWrite ? undefined : "flex-1"}>
                          <Settings className="size-3.5" aria-hidden />Manage
                        </ButtonLink>
                        {b.linkedAgentId && (
                          <ButtonLink href={`/ai/agents/${b.linkedAgentId}`} variant="outline" size="sm" title="Edit linked AI Agent">
                            <Sparkles className="size-3.5 text-lavender" aria-hidden />AI
                          </ButtonLink>
                        )}
                        {b.username && (
                          <a href={`https://t.me/${b.username}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${b.name} in Telegram`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-lavender/60">
                            <ExternalLink className="size-3.5" aria-hidden />Open
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
          <li>
            <Card className="flex h-full min-h-[210px] flex-col items-center justify-center border-dashed border-lavender/40 bg-surface-2/40 p-6 text-center">
              <IconTile tone="primary" size="lg"><Plus /></IconTile>
              <p className="mt-3 font-bold">Add Another Bot</p>
              <p className="mt-1 max-w-xs text-xs text-muted">Connect a new @BotFather token or launch an AI-powered Telegram assistant.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <ButtonLink href="/bots/new" size="sm"><Plus className="size-3.5" />Create Bot</ButtonLink>
                <ButtonLink href="/bots/templates" variant="outline" size="sm"><LayoutGrid className="size-3.5" />Templates</ButtonLink>
              </div>
            </Card>
          </li>
        </ul>
      )}

      {/* Created & Deleted Bot History + Configuration Log */}
      <Card>
        <CardHeader
          title="Bot Lifecycle History & Configuration"
          description="Tracks every created bot, deleted bot, Telegram deletion alert, what each bot is used for, and its saved setup."
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["created", "Created"],
                  ["updated", "Updated"],
                  ["deleted", "Deleted"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHistoryFilter(id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    historyFilter === id
                      ? "bg-primary text-white shadow-sm"
                      : "border border-border/80 bg-surface-2/60 text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <div className="p-5 pt-2">
          {visibleHistory.length === 0 ? (
            <div className="panel flex items-center gap-3 p-4 text-sm text-muted">
              <History className="size-5 text-lavender" />
              <span>No lifecycle records match this filter yet. Creating or deleting bots automatically logs configuration snapshots here.</span>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleHistory.map((h) => {
                const badgeTone = h.event === "created" ? "success" : h.event === "updated" ? "info" : h.event === "deleted_on_telegram" ? "danger" : "warning";
                const eventLabel = h.event === "created" ? "Created" : h.event === "updated" ? "Updated" : h.event === "deleted_on_telegram" ? "Telegram Deleted" : "Deleted in RelayNest";
                const EvIcon = h.event === "created" ? CheckCircle2 : h.event === "updated" ? Pencil : h.event === "deleted_on_telegram" ? AlertTriangle : Trash2;
                return (
                  <li key={h.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <IconTile tone={badgeTone === "success" ? "success" : badgeTone === "info" ? "info" : badgeTone === "danger" ? "danger" : "warning"} size="md">
                        <EvIcon />
                      </IconTile>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">{h.botName}</span>
                          {h.username && <span className="text-xs font-medium text-lavender">@{h.username}</span>}
                          <Badge tone={badgeTone} dot>{eventLabel}</Badge>
                        </div>
                        <p className="text-sm text-foreground/85">
                          <span className="font-semibold text-foreground">Used for:</span> {h.usedFor || h.description || "General Telegram automation"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                          {h.category && <span className="rounded-md border border-border/80 bg-surface/60 px-2 py-0.5 text-foreground/80">{h.category}</span>}
                          {h.modelName && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-lavender">
                              <Sparkles className="size-3" />{h.modelName}
                            </span>
                          )}
                          {h.commands.length > 0 && (
                            <span className="rounded-md border border-border/80 bg-surface/60 px-2 py-0.5">
                              Commands: {h.commands.slice(0, 5).join(", ")}{h.commands.length > 5 ? ` +${h.commands.length - 5}` : ""}
                            </span>
                          )}
                          <span className="tabular-nums">{h.messagesCount.toLocaleString()} messages handled</span>
                        </div>
                        {(h.welcomeMessage || h.defaultResponse) && (
                          <p className="line-clamp-1 pt-0.5 text-xs text-muted">
                            {h.welcomeMessage ? `Welcome: "${h.welcomeMessage}"` : ""}
                            {h.welcomeMessage && h.defaultResponse ? " · " : ""}
                            {h.defaultResponse ? `Fallback: "${h.defaultResponse}"` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted sm:flex-col sm:items-end">
                      <span className="inline-flex items-center gap-1 font-medium"><Clock className="size-3.5" />{relTime(h.occurredAt, prefs)}</span>
                      {h.botCreatedAt && <span>Created {formatUserDate(h.botCreatedAt, prefs)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <EditBotModal
        bot={editTarget}
        demo={demo}
        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          void refreshHistory();
          router.refresh();
        }}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Bot & Clean Up Telegram?"
        icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemoveBot} disabled={deleting}>
              <Trash2 className="size-4" />{deleting ? "Deleting..." : "Delete Bot Now"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-foreground/85">
          <p>
            Are you sure you want to delete <span className="font-bold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span>
            {deleteTarget?.username ? <> (@{deleteTarget.username})</> : null}?
          </p>
          <p className="text-xs leading-relaxed text-muted">
            RelayNest will immediately clear its Telegram webhook, pending updates, menu commands, description, and profile photo, and save the configuration summary inside Bot Lifecycle History.
            {deleteTarget?.webhookStatus === "telegram_deleted" ? "" : " (If you also want to delete the @username handle permanently on Telegram itself, send /deletebot to @BotFather.)"}
          </p>
        </div>
      </Modal>
    </div>
  );
}
