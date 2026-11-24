"use client";

import { BarChart3, Bot, Calendar, Check, Code2, CreditCard, Crown, Database, FileText, Info, Layers, Scale, Tag, Users, Zap, Trash2, Pencil, Download, X, RefreshCw, Settings } from "lucide-react";
import * as React from "react";
import { Badge, ComingSoon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/motion/split-text";

const plans = [
  { id: "free", name: "Free", price: 0, icon: Crown, cur: true, feats: ["Limited bot management (up to 3 bots)", "Basic bot templates", "Basic automation (up to 100 executions/month)", "Basic analytics (7-day history)"] },
  { id: "pro", name: "Pro", price: 9, icon: Zap, feats: ["More bots (up to 20 bots)", "Advanced automation (up to 5,000 executions/month)", "Extended analytics (30-day history)", "Increased API & workflow limits"] },
  { id: "biz", name: "Business", price: 29, icon: Users, feats: ["Team collaboration (multiple members)", "Higher limits (up to 100 bots)", "Advanced workspace management", "Priority support"] },
];
const usage = [["Bots", Bot, 1, 3, ""], ["Automation Executions", Zap, 24, 100, " per month"], ["API Requests", Code2, 1250, 10000, " per month"], ["Storage", Database, 52, 500, " MB"]] as const;
const compare: [string, string, string, string][] = [["Bots", "Up to 3", "Up to 20", "Up to 100"], ["Automation Executions", "100 / month", "5,000 / month", "Unlimited"], ["Analytics History", "7 days", "30 days", "Custom"], ["Team Members", "1", "Up to 5", "Unlimited"], ["Priority Support", "-", "-", "Included"]];
const invoices = ["INV-0004|Oct 01, 2026", "INV-0003|Sep 01, 2026", "INV-0002|Aug 01, 2026", "INV-0001|Jul 01, 2026"].map((s) => s.split("|") as [string, string]);

/** Visual preview of the planned billing area. Sample data; no payments are processed. */
export function BillingPreview() {
  const [annual, setAnnual] = React.useState(false);
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><CreditCard /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Billing & Subscription" /></h1><p className="text-sm text-foreground/80">Manage your subscription, payment methods, and invoices.</p></div></div>
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm"><ComingSoon /><span className="text-foreground/85">Paid plans are not available yet. Everyone is on the Free plan, and the payment details below are sample data.</span></div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[0.9fr_1.5fr]">
        <Card>
          <CardHeader title="Current Plan" icon={<Crown />} tile />
          <div className="space-y-4 p-5 pt-2">
            <div className="panel flex gap-4 p-4">
              <IconTile size="xl" tone="primary" className="size-20 rounded-2xl"><Crown className="!size-10" /></IconTile>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-extrabold">Free Plan</h3><Badge tone="neutral">Not Upgraded</Badge></div><p className="mt-1 text-sm text-foreground/80">You&apos;re currently on the Free plan.</p>
                <dl className="grid-cols-1 mt-3 grid grid-cols-2 gap-3 text-sm">{[[Calendar, "Billing Cycle", "-"], [Tag, "Monthly Price", "$0 / month"], [RefreshCw, "Next Renewal", "-"], [Check, "Status", "Free Plan"]].map(([I, l, v]) => { const Icon = I as typeof Calendar; return <div key={String(l)} className="flex items-center gap-2"><Icon className="size-4 text-lavender" aria-hidden /><div className="leading-tight"><dt className="text-[11px] text-muted">{String(l)}</dt><dd className="font-semibold">{String(v)}</dd></div></div>; })}</dl></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button disabled title="Paid plans are not available yet."><Zap className="size-4" />Upgrade Plan</Button><Button variant="outline" disabled><Settings className="size-4" />Manage Subscription</Button><Button variant="danger-outline" disabled><X className="size-4" />Cancel Subscription</Button></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Available Plans" description="Choose the right plan for your team and automation needs." icon={<Layers />} tile
            action={<div role="radiogroup" aria-label="Billing period" className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">{[["Monthly", false], ["Annual", true]].map(([l, v]) => <button key={String(l)} role="radio" aria-checked={annual === v} onClick={() => setAnnual(Boolean(v))} className={cn("rounded-md px-3 py-1.5", annual === v ? "btn-primary-bg text-white" : "text-muted")}>{String(l)}{v ? <span className="ml-1.5 rounded bg-success/20 px-1 text-ok">Save 20%</span> : null}</button>)}</div>} />
          <div className="grid-cols-1 grid gap-3 px-5 pb-5 md:grid-cols-3">
            {plans.map((p) => {
              const price = annual ? Math.round(p.price * 0.8) : p.price;
              return (
                <div key={p.id} className={cn("rounded-2xl border p-4", p.cur ? "border-lavender bg-primary/10 shadow-[0_0_28px_-10px_rgb(var(--rn-primary))]" : "border-border bg-surface-2/60")}>
                  <h3 className="flex items-center gap-2 text-lg font-extrabold"><p.icon className="size-5 text-lavender" aria-hidden />{p.name}</h3>
                  <p className="mt-1"><span className="text-3xl font-extrabold">${price}</span> <span className="text-sm text-foreground/75">/ month</span></p>
                  <ul className="mt-3 space-y-2 text-[13px]">{p.feats.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{f}</li>)}</ul>
                  <Button disabled variant={p.cur ? "outline" : "primary"} className="mt-4 w-full">{p.cur ? <><Check className="size-4" />Current Plan</> : `Upgrade to ${p.name}`}</Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid-cols-1 grid gap-5 xl:grid-cols-[0.9fr_1.5fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Usage Summary" description="Your current usage and plan limits." icon={<BarChart3 />} tile action={<Badge tone="neutral">Free Plan Limits</Badge>} />
            <ul className="space-y-2.5 px-5 pb-5">
              {usage.map(([l, I, u, max, suffix]) => (
                <li key={l} className="panel p-3"><div className="flex items-center gap-3"><I className="size-5 text-lavender" aria-hidden /><span className="flex-1 text-sm font-semibold">{l}</span><span className="text-sm tabular-nums">{u.toLocaleString()} / {max.toLocaleString()}{suffix}</span></div>
                  <div className="mt-2 h-2 rounded-full bg-foreground/10" role="progressbar" aria-label={l} aria-valuenow={u} aria-valuemin={0} aria-valuemax={max}><div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.min(100, (u / max) * 100)}%` }} /></div></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Plan Comparison" description="See what's included in each plan." icon={<Scale />} tile />
            <div className="overflow-x-auto px-5 pb-5"><table className="rn-table min-w-[420px]"><thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Business</th></tr></thead>
              <tbody>{compare.map(([f, a, b, c]) => <tr key={f}><td className="font-semibold">{f}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody></table></div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Payment Methods" description="Manage your saved payment methods." icon={<CreditCard />} tile action={<Button disabled title="Payments are not available yet."><span aria-hidden>+</span> Add Payment Method</Button>} />
            <div className="overflow-x-auto px-5 pb-5"><table className="rn-table min-w-[560px]"><thead><tr><th>Provider</th><th>Card</th><th>Details</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody><tr><td><span className="rounded bg-[#635BFF] px-2 py-0.5 text-xs font-extrabold">stripe</span></td><td className="font-extrabold italic text-info">VISA</td><td>&bull;&bull;&bull;&bull; 4242</td><td>Dec 2027</td><td><Badge tone="success"><Check className="size-3" aria-hidden />Default</Badge></td>
                <td><span className="flex gap-2 text-muted" aria-hidden><Pencil className="size-4" /><Trash2 className="size-4 text-bad" /></span></td></tr></tbody></table><p className="mt-2 text-[11px] text-muted">Sample card (Stripe test number). No payment data is stored.</p></div>
          </Card>
          <Card>
            <CardHeader title="Billing History" description="Your invoices and payment receipts." icon={<FileText />} tile />
            <div className="overflow-x-auto px-5 pb-5"><table className="rn-table min-w-[560px]"><thead><tr><th>Invoice ID</th><th>Date</th><th>Amount</th><th>Status</th><th>Payment Method</th><th>Invoice</th></tr></thead>
              <tbody>{invoices.map(([id, d]) => <tr key={id}><td className="font-mono text-xs">{id}</td><td>{d}</td><td>$9.00</td><td><Badge tone="success"><Check className="size-3" aria-hidden />Paid</Badge></td><td><span className="font-extrabold italic text-info">VISA</span> &bull;&bull;&bull;&bull; 4242</td><td><span className="grid-cols-1 grid size-8 place-items-center rounded-md border border-border text-muted" aria-hidden><Download className="size-4" /></span></td></tr>)}</tbody></table></div>
          </Card>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-4"><Info className="size-6 text-info" aria-hidden /><div className="min-w-[260px] flex-1 leading-tight"><p className="font-bold">Billing Information</p><p className="text-sm text-foreground/75">You&apos;re currently on the Free plan. Paid plans will unlock more bots, higher limits, advanced automation, and team collaboration.</p></div><Button disabled>Upgrade Plan <span aria-hidden>&rarr;</span></Button></Card>
    </div>
  );
}
