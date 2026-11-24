import { Coins, Cpu, Hash, Zap } from "lucide-react";
import Link from "next/link";
import { TrendChart } from "@/components/charts/lazy-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiUsageData } from "@backend/server/services/ai-usage";
const usd = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(n < 1 ? 4 : 2)}`);
const num = (n: number) => n.toLocaleString("en-US");
const providerLabel = { nvidia: "NVIDIA Build", vercel: "Vercel AI Gateway" } as const;
const originLabel: Record<string, string> = { playground: "Playground", agent: "AI agents & bots", knowledge: "Knowledge Base", api: "API" };
/** Token and cost usage of the workspace's model calls (NVIDIA Build and Vercel AI Gateway). */
export function AiUsageSection({ data }: { data: AiUsageData }) {
  const ranges = [7, 30].filter((d) => d <= data.maxDays);
  const chart = data.daily.map((d) => ({ day: d.day.slice(5), value: d.tokens }));
  return (
    <section aria-label="AI usage" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-extrabold tracking-tight">AI usage & cost</h2><p className="text-sm text-foreground/75">Tokens and spend for model calls from the Playground, AI agents and the Knowledge Base. Last {data.days} days.</p></div>
        {ranges.length > 1 && (
          <div role="group" aria-label="AI usage range" className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
            {ranges.map((d) => <Link key={d} href={`?range=${d}`} scroll={false} aria-current={data.days === d} className={cn("rounded-md px-3 py-1.5", data.days === d ? "btn-primary-bg text-white" : "text-muted")}>{d} days</Link>)}
          </div>
        )}
      </div>
      <div className="grid-cols-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Model requests" value={num(data.totals.requests)} icon={<Zap />} tone="primary" subtle hint="Successful calls to a model" />
        <StatCard label="Total tokens" value={num(data.totals.totalTokens)} icon={<Hash />} tone="info" subtle hint={`${num(data.totals.promptTokens)} input, ${num(data.totals.completionTokens)} output`} />
        <StatCard label="Estimated cost" value={usd(data.totals.costUsd)} icon={<Coins />} tone="success" subtle hint="Vercel from reported or list prices. NVIDIA Build is a free trial tier, so it counts as $0." />
        <StatCard label="Models used" value={num(data.byModel.length)} icon={<Cpu />} tone="cyan" subtle />
      </div>
      {data.totals.requests === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No model calls in this period yet. Usage shows up after you run a model in the Playground or an AI agent answers a message.</Card>
      ) : (
        <div className="grid-cols-1 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Tokens per day" as="h3" />
            <div className="px-3 pb-4"><TrendChart id="aitok" label="Tokens per day" color="#22D3EE" data={chart} /></div>
          </Card>
          <Card>
            <CardHeader title="By provider" as="h3" />
            <ul className="space-y-3 px-5 pb-5">
              {data.byProvider.map((p) => (
                <li key={p.source} className="panel flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{providerLabel[p.source]}</p><p className="text-xs text-muted">{num(p.requests)} requests &middot; {num(p.tokens)} tokens</p></div>
                  <Badge tone={p.source === "nvidia" ? "success" : "info"}>{usd(p.costUsd)}</Badge>
                </li>
              ))}
            </ul>
            <div className="border-t border-border/60 px-5 py-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">By feature</p>
              <ul className="space-y-1.5 text-sm">{data.byOrigin.map((o) => <li key={o.origin} className="flex justify-between"><span>{originLabel[o.origin] ?? o.origin}</span><span className="tabular-nums text-foreground/80">{num(o.tokens)} tokens</span></li>)}</ul>
            </div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Top models" as="h3" />
            <div className="overflow-x-auto px-5 pb-5">
              <table className="rn-table min-w-[520px]"><thead><tr><th>Model</th><th>Provider</th><th className="text-right">Requests</th><th className="text-right">Tokens</th><th className="text-right">Cost</th></tr></thead>
                <tbody>{data.byModel.map((m) => <tr key={m.slug}><td className="font-semibold">{m.slug}</td><td>{providerLabel[m.source]}</td><td className="text-right tabular-nums">{num(m.requests)}</td><td className="text-right tabular-nums">{num(m.tokens)}</td><td className="text-right tabular-nums">{usd(m.costUsd)}</td></tr>)}</tbody></table>
            </div>
          </Card>
        </div>
      )}
      {data.gateway && (
        <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
          <Badge tone="info">Platform admin</Badge>
          <span>Vercel AI Gateway account: <strong>{usd(data.gateway.balance)}</strong> credit left, <strong>{usd(data.gateway.totalUsed)}</strong> used in total (all workspaces).</span>
        </Card>
      )}
    </section>
  );
}
