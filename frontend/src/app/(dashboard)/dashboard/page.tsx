import { Activity, Bot, ChevronRight, Cog, Layers, LayoutGrid, MessageSquare, Pencil, Play, Plug, Plus, Send, Workflow, Zap, Square, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BotAvatar } from "@/components/bots/bot-avatar";
import { StatusBadge } from "@/components/bots/status-badge";
import { TrendChart } from "@/components/charts/lazy-charts";
import { SplitText } from "@/components/motion/split-text";
import { StatCard } from "@/components/dashboard/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { getDashboardData } from "@backend/server/services/dashboard";
import { getSessionUser } from "@backend/server/services/session";

export const metadata = { title: "Overview" };

const activityIcon: Record<string, { Icon: typeof Send; cls: string; dot: string }> = {
  info: { Icon: Send, cls: "bg-info/25 text-sky", dot: "bg-info" },
  success: { Icon: Play, cls: "bg-success/20 text-ok", dot: "bg-success" },
  primary: { Icon: Zap, cls: "bg-primary/25 text-lavender", dot: "bg-lavender" },
  neutral: { Icon: Cog, cls: "bg-foreground/10 text-foreground/80", dot: "bg-lavender" },
  danger: { Icon: Square, cls: "bg-danger/20 text-bad", dot: "bg-[#FF4D7E]" },
};

const quick = [
  { href: "/bots/new", label: "Create New Bot", icon: Plus, primary: true },
  { href: "/bots/templates", label: "Browse Templates", icon: LayoutGrid },
  { href: "/integrations", label: "Connect Telegram Bot", icon: Send },
  { href: "/agents", label: "Create Automation", icon: Workflow },
];

export default async function DashboardPage() {
  const [d, user] = await Promise.all([getDashboardData(), getSessionUser()]);
  const empty = d.bots.length === 0;
  const fmt = (n: number) => n.toLocaleString();
  const first = user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="relative">
        <h1 className="text-[34px] font-extrabold tracking-tight">
          <SplitText text={`Welcome back${first && !user.demo ? `, ${first}` : ""}!`} rainbow /> <span aria-hidden className="emoji-wave">&#128075;</span>
        </h1>
        <p className="mt-1 text-[15px] text-foreground/80">Here&apos;s what&apos;s happening with your bots.</p>
        <Image src="/images/illustrations/hero-plane.png" alt="" width={522} height={183} priority className="pointer-events-none absolute -top-6 right-0 -z-10 hidden h-36 w-auto fade-edges xl:block light:hidden" />
      </div>

      <section aria-label="Key metrics" className="grid-cols-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Bots" value={fmt(d.totals.bots)} delta={d.demo ? "+50%" : undefined} hint="All bots in this workspace" icon={<Bot />} tone="primary" />
        <StatCard label="Active Bots" value={fmt(d.totals.activeBots)} delta={d.demo ? "+25%" : undefined} hint="Bots that are online and receiving messages" icon={<Play />} tone="success" />
        <StatCard label="Messages Processed" value={fmt(d.totals.messages)} delta={d.demo ? "+38%" : undefined} hint="Messages handled by your bots" icon={<MessageSquare />} tone="info" />
        <StatCard label="Automation Executions" value={fmt(d.totals.executions)} delta={d.demo ? "+42%" : undefined} hint="Workflow and command runs" icon={<Layers />} tone="primary" />
      </section>

      <div className="grid-cols-1 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="My Bots" icon={<Bot />} action={<Link href="/bots" className="flex items-center gap-1 text-sm font-semibold text-lavender hover:underline">View All Bots <ChevronRight className="size-4" aria-hidden /></Link>} />
          {empty ? (
            <EmptyState title="You haven't created any bots yet." description="Get started by creating a new Telegram bot or use a ready-made template."
              image={{ src: "/images/illustrations/empty-box.png", width: 199, height: 146 }}
              action={<ButtonLink href="/bots/new">Create Your First Bot <span aria-hidden>&rarr;</span></ButtonLink>} />
          ) : (
            <div className="overflow-x-auto px-5 pb-4">
              <table className="rn-table min-w-[620px]">
                <thead><tr><th>Bot Name</th><th>Telegram Username</th><th>Status</th><th>Messages</th><th>Last Active</th><th className="text-center">Actions</th></tr></thead>
                <tbody>
                  {d.bots.slice(0, 5).map((b) => (
                    <tr key={b.id}>
                      <td><Link href={`/bots/${b.id}`} className="flex items-center gap-3 font-semibold hover:text-lavender"><BotAvatar name={b.name} avatarPath={b.avatarPath} />{b.name}</Link></td>
                      <td className="text-foreground/85">{b.username ? `@${b.username}` : "-"}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="tabular-nums">{b.messages.toLocaleString()}</td>
                      <td className="text-foreground/85">{b.lastActive}</td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/bots/${b.id}`} aria-label={`Open ${b.name}`} className="grid-cols-1 grid size-8 place-items-center rounded-md text-foreground/85 hover:bg-foreground/5"><Play className="size-4" /></Link>
                          <Link href={`/bots/${b.id}`} aria-label={`Edit ${b.name}`} className="grid-cols-1 grid size-8 place-items-center rounded-md text-foreground/85 hover:bg-foreground/5"><Pencil className="size-4" /></Link>
                          <Link href={`/bots/${b.id}`} aria-label={`More actions for ${b.name}`} className="grid-cols-1 grid size-8 place-items-center rounded-md text-foreground/85 hover:bg-foreground/5"><MoreHorizontal className="size-4" /></Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick Actions" icon={<Zap />} />
          <div className="space-y-2.5 px-5 pb-5">
            {quick.map((a) => (
              <Link key={a.label} href={a.href}
                className={`flex h-12 items-center justify-between rounded-lg px-4 text-sm font-semibold transition ${a.primary ? "btn-primary-bg text-white" : "panel hover:border-lavender/60"}`}>
                <span className="flex items-center gap-3"><a.icon className="size-[18px]" aria-hidden />{a.label}</span>
                <span aria-hidden>&rarr;</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-cols-1 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader title="Recent Activity" icon={<Activity />} action={<Link href="/executions" className="text-sm font-semibold text-lavender hover:underline">View All Activity <span aria-hidden>&rarr;</span></Link>} />
          {d.activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Events like bot connections and automation runs will show up here." icon={<Activity className="size-9" />} />
          ) : (
            <ol className="relative space-y-1 px-5 pb-5 before:absolute before:bottom-8 before:left-[26px] before:top-4 before:w-px before:bg-border">
              {d.activity.map((a) => {
                const t = activityIcon[a.tone] ?? activityIcon.neutral!;
                return (
                  <li key={a.id} className="relative flex items-center gap-3 py-2">
                    <span className={`z-10 size-2.5 shrink-0 rounded-full ring-4 ring-surface ${t.dot}`} aria-hidden />
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${t.cls}`} aria-hidden><t.Icon className="size-4" /></span>
                    <span className="w-[150px] shrink-0 text-sm font-semibold">{a.title}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">{a.detail}</span>
                    <span className="shrink-0 text-xs text-muted">{a.when}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {empty ? (
          <Card className="flex items-center justify-center">
            <EmptyState title="You haven't created any bots yet." description="Get started by creating a new Telegram bot or use a ready-made template."
              image={{ src: "/images/illustrations/empty-box.png", width: 199, height: 146 }}
              action={<ButtonLink href="/bots/new">Create Your First Bot <span aria-hidden>&rarr;</span></ButtonLink>} />
          </Card>
        ) : (
          <Card>
            <CardHeader title="7-Day Analytics" icon={<Plug />} description="Executions & AI usage over the last 7 days"
              action={<Link href="/analytics" className="text-sm font-semibold text-lavender hover:underline">Full Analytics &rarr;</Link>} />
            <div className="grid grid-cols-3 gap-2 px-5 pb-3 text-center text-xs">
              <div className="panel p-2"><p className="text-muted">Runs (7d)</p><p className="mt-0.5 text-sm font-extrabold tabular-nums">{d.quickStats.executions7d.toLocaleString()}</p></div>
              <div className="panel p-2"><p className="text-muted">Success Rate</p><p className="mt-0.5 text-sm font-extrabold tabular-nums text-ok">{d.quickStats.successRate}%</p></div>
              <div className="panel p-2"><p className="text-muted">AI Tokens (7d)</p><p className="mt-0.5 text-sm font-extrabold tabular-nums">{d.quickStats.aiTokens7d.toLocaleString()}</p></div>
            </div>
            <div className="px-3 pb-4">
              {d.trend.some((t) => t.value > 0) ? <TrendChart data={d.trend} /> : <EmptyState title="No executions in the last 7 days" description="Run an automation or message a bot to see the trend." icon={<Zap className="size-9" />} />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}