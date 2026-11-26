"use client";
/* The bell keeps its unread badge in sync and shows categorized notifications in a dropdown with read/dismiss controls. */
import {
  Bell, BookOpen, Bot, CheckCheck, CreditCard, KeyRound, Link2, LogIn, Megaphone, Plug, Settings, ShieldAlert,
  Sparkles, Trash2, UserRound, Users, Webhook, Workflow, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { INAPP_CATEGORY_LABELS, type InAppNotificationKey } from "@backend/lib/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  kind: string;
  category?: InAppNotificationKey;
  title: string;
  body: string | null;
  action_url?: string | null;
  read_at: string | null;
  created_at: string;
}

const icons: Record<string, typeof Bell> = {
  login_detected: LogIn,
  password_changed: ShieldAlert,
  sessions_revoked: ShieldAlert,
  bot_created: Bot,
  bot_connected: Link2,
  bot_updated: Bot,
  bot_photo_updated: Bot,
  bot_activated: Zap,
  bot_paused: Bot,
  bot_disconnected: Bot,
  bot_deleted: Bot,
  bot_deleted_telegram: ShieldAlert,
  bot_token_updated: KeyRound,
  agent_created: Sparkles,
  agent_updated: Sparkles,
  agent_connected: Sparkles,
  agent_activated: Sparkles,
  agent_deactivated: Sparkles,
  agent_deleted: Sparkles,
  agent_execution_failed: ShieldAlert,
  kb_collection_created: BookOpen,
  kb_collection_deleted: BookOpen,
  kb_document_indexed: BookOpen,
  kb_document_failed: ShieldAlert,
  automation_created: Workflow,
  automation_published: Workflow,
  automation_unpublished: Workflow,
  automation_succeeded: Zap,
  automation_deleted: Workflow,
  execution_failed: ShieldAlert,
  profile_updated: UserRound,
  workspace_updated: Settings,
  member_invited: Users,
  api_key_created: KeyRound,
  api_key_rotated: KeyRound,
  api_key_revoked: ShieldAlert,
  api_key_deleted: KeyRound,
  integration_connected: Plug,
  integration_tested: Plug,
  integration_toggled: Plug,
  integration_failed: ShieldAlert,
  integration_deleted: Plug,
  webhook_provisioned: Webhook,
  webhook_triggered: Webhook,
  payment_received: CreditCard,
  payment_failed: CreditCard,
  payment_refunded: CreditCard,
  plan_activated: CreditCard,
  plan_renewing: CreditCard,
  plan_expiring: CreditCard,
  subscription_cancelled: CreditCard,
  plan_limit: ShieldAlert,
  system_announcement: Megaphone,
};

const tone = (k: string, category?: InAppNotificationKey) =>
  k.includes("failed") || k === "plan_limit" || k === "plan_expiring" || k === "bot_deleted_telegram" || category === "executionFailures"
    ? "bg-danger/20 text-bad"
    : k.startsWith("payment") || k.startsWith("plan") || category === "billing"
      ? "bg-success/20 text-ok"
      : category === "security"
        ? "bg-warning/20 text-warn"
        : "bg-primary/25 text-lavender";

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function NotificationBell({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    if (demo) return;
    const r = await api<{ items: Item[]; unread: number }>("/api/v1/notifications?limit=30");
    if (r.ok) {
      setItems(r.data.items);
      setUnread(r.data.unread);
    }
  }, [demo]);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);
  React.useEffect(() => { if (open) void load(); }, [open, load]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  async function readAll() {
    setItems((l) => l?.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) ?? l);
    setUnread(0);
    await api("/api/v1/notifications", { body: { readAll: true } });
  }

  async function openItem(i: Item) {
    if (!i.read_at) {
      setItems((l) => l?.map((x) => (x.id === i.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? l);
      setUnread((n) => Math.max(0, n - 1));
      void api("/api/v1/notifications", { body: { id: i.id } });
    }
    if (i.action_url && i.action_url.startsWith("/")) {
      setOpen(false);
      router.push(i.action_url);
    }
  }

  async function dismissOne(e: React.MouseEvent, i: Item) {
    e.stopPropagation();
    setItems((l) => l?.filter((x) => x.id !== i.id) ?? l);
    if (!i.read_at) setUnread((n) => Math.max(0, n - 1));
    await api("/api/v1/notifications", { method: "DELETE", body: { id: i.id } });
  }

  async function clearRead() {
    setItems((l) => l?.filter((x) => !x.read_at) ?? l);
    await api("/api/v1/notifications", { method: "DELETE", body: { clearRead: true } });
  }

  const visibleItems = React.useMemo(() => {
    if (!items) return null;
    return filter === "unread" ? items.filter((i) => !i.read_at) : items;
  }, [items, filter]);

  const hasRead = Boolean(items?.some((i) => Boolean(i.read_at)));

  return (
    <div className="relative" ref={ref}>
      <Tooltip content="Notifications" side="bottom">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-10 place-items-center rounded-lg text-foreground/90 transition hover:bg-foreground/5"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-[#FF4D7E] px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-background" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Tooltip>
      {open && (
        <div role="dialog" aria-label="Notifications" className="card pop-in absolute right-0 z-40 mt-2 w-[min(92vw,400px)] overflow-hidden bg-[#0F0E26]/95 p-0 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <p className="font-bold">
              Notifications
              {unread > 0 && <span className="ml-2 rounded-full bg-primary/25 px-2 py-0.5 text-xs text-lavender">{unread} new</span>}
            </p>
            <button
              type="button"
              onClick={() => void readAll()}
              disabled={unread === 0}
              className="flex items-center gap-1 text-xs font-semibold text-lavender hover:underline disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" aria-hidden />Mark all read
            </button>
          </div>
          {!demo && (
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Filter notifications">
                {(["all", "unread"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={filter === tab}
                    onClick={() => setFilter(tab)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition",
                      filter === tab ? "bg-primary/25 text-lavender" : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    {tab === "unread" ? `Unread (${unread})` : "All"}
                  </button>
                ))}
              </div>
              {hasRead && (
                <button
                  type="button"
                  onClick={() => void clearRead()}
                  className="flex items-center gap-1 text-[11px] font-semibold text-foreground/65 transition hover:text-foreground"
                >
                  <Trash2 className="size-3" aria-hidden />Clear read
                </button>
              )}
            </div>
          )}
          <ul className="max-h-[360px] overflow-y-auto">
            {demo ? (
              <li className="p-6 text-center text-sm text-muted">Sign in with Supabase to see live notifications.</li>
            ) : visibleItems === null ? (
              <li className="p-6 text-center text-sm text-muted">Loading...</li>
            ) : visibleItems.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">
                <Bell className="mx-auto mb-2 size-7 opacity-50" aria-hidden />
                {filter === "unread" ? "No unread notifications." : "You're all caught up."}
                <br />
                Bot, agent, knowledge, security and billing updates appear here.
              </li>
            ) : (
              visibleItems.map((i) => {
                const Icon = icons[i.kind] ?? Bell;
                const catLabel = i.category ? INAPP_CATEGORY_LABELS[i.category] : undefined;
                return (
                  <li key={i.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => void openItem(i)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 pr-9 text-left transition hover:bg-foreground/5",
                        !i.read_at && "bg-primary/5",
                      )}
                    >
                      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", tone(i.kind, i.category))}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold leading-snug">{i.title}</span>
                          {!i.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#FF4D7E]" aria-label="Unread" />}
                        </span>
                        {i.body && <span className="mt-0.5 block text-xs leading-snug text-foreground/75">{i.body}</span>}
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                          <span>{ago(i.created_at)}</span>
                          {catLabel && (
                            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground/75">
                              {catLabel}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void dismissOne(e, i)}
                      aria-label="Dismiss notification"
                      className="absolute right-2 top-2.5 grid size-6 place-items-center rounded-md text-foreground/45 opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            href="/settings/notifications"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block border-t border-border/70 px-4 py-2.5 text-center text-xs font-semibold text-lavender hover:bg-foreground/5"
          >
            Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
