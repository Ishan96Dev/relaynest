"use client";

import { ArrowRight, Check, Crown, ShieldCheck, Users, Zap, type LucideIcon } from "lucide-react";
import * as React from "react";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, PLANS, priceFor, type Currency, type Cycle, type PlanId } from "@backend/lib/billing/plans";

interface PlanMeta {
  id: PlanId;
  icon: LucideIcon;
  blurb: string;
  featured?: boolean;
  features: string[];
}

const plans: PlanMeta[] = [
  { id: "free", icon: Crown, blurb: "Everything you need to launch your first bots.", features: ["Up to 3 bots", "Basic bot templates", "Basic automation (100 executions/month)", "Basic analytics (7-day history)", "Community support"] },
  { id: "pro", icon: Zap, featured: true, blurb: "For makers running bots for real audiences.", features: ["Up to 20 bots", "Advanced automation (5,000 executions/month)", "Extended analytics (30-day history)", "Increased API and workflow limits", "Up to 5 team members"] },
  { id: "business", icon: Users, blurb: "For teams that collaborate and need scale.", features: ["Up to 100 bots", "Unlimited automation executions", "Team collaboration and workspace management", "Custom analytics history", "Priority support"] },
];

export function PricingPlans() {
  const [cycle, setCycle] = React.useState<Cycle>("monthly");
  const [cur, setCur] = React.useState<Currency>("USD");
  const [mode, setMode] = React.useState<"subscription" | "one_time">("subscription");
  const annual = cycle === "annual";

  return (
    <div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <div role="radiogroup" aria-label="Billing period" className="relative flex rounded-full border border-border bg-surface/80 p-1 text-sm font-semibold">
          <span aria-hidden className={cn("absolute inset-y-1 w-[calc(50%-4px)] rounded-full btn-primary-bg transition-transform duration-300 ease-out", annual && "translate-x-full")} />
          {([["Monthly", "monthly"], ["Annual", "annual"]] as const).map(([label, value]) => (
            <button key={label} role="radio" aria-checked={cycle === value} onClick={() => setCycle(value)}
              className={cn("relative z-10 flex h-10 w-32 items-center justify-center gap-2 rounded-full transition-colors duration-300", cycle === value ? "text-white" : "text-muted hover:text-foreground")}>
              {label}{value === "annual" && <span className="rounded-full bg-success/25 px-1.5 text-[10px] text-ok">-20%</span>}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Payment type" className="relative flex rounded-full border border-border bg-surface/80 p-1 text-xs font-semibold">
          <span aria-hidden className={cn("absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-foreground/10 ring-1 ring-inset ring-foreground/15 transition-transform duration-300 ease-out", mode === "one_time" && "translate-x-full")} />
          {([["Auto-renew", "subscription"], ["One-time", "one_time"]] as const).map(([label, value]) => (
            <button key={value} role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
              className={cn("relative z-10 flex h-10 w-28 items-center justify-center rounded-full transition-colors duration-300", mode === value ? "text-foreground" : "text-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Currency" className="relative flex rounded-full border border-border bg-surface/80 p-1 text-xs font-semibold">
          <span aria-hidden className={cn("absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-foreground/10 ring-1 ring-inset ring-foreground/15 transition-transform duration-300 ease-out", cur === "INR" && "translate-x-full")} />
          {([["USD ($)", "USD"], ["INR (\u20B9)", "INR"]] as const).map(([label, value]) => (
            <button key={value} role="radio" aria-checked={cur === value} onClick={() => setCur(value)}
              className={cn("relative z-10 flex h-10 w-24 items-center justify-center rounded-full transition-colors duration-300", cur === value ? "text-foreground" : "text-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mx-auto mt-10 grid max-w-[1100px] items-stretch gap-6 text-left md:grid-cols-3">
        {plans.map((p, i) => {
          const def = PLANS[p.id];
          const periodPrice = priceFor(p.id, cycle, cur);
          const paid = p.id !== "free";
          const perMonth = annual && paid ? formatMoney(Math.round(periodPrice / 12), cur) : null;
          const href = `/settings/billing?plan=${p.id}&cycle=${cycle}&currency=${cur}&mode=${mode}`;
          return (
            <Reveal as="li" key={p.id} delay={i * 120} variant="up" className={cn("relative", p.featured && "md:-mt-3 md:mb-3")}>
              {p.featured && (
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full btn-primary-bg px-3.5 py-1 text-xs font-bold text-white shadow-lg">Most popular</span>
              )}
              <div className={cn("lift flex h-full flex-col rounded-3xl p-7", p.featured ? "card-glow shadow-[0_30px_80px_-30px_rgb(var(--rn-primary))]" : "card")}>
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-11 place-items-center rounded-xl ring-1 ring-inset", p.featured ? "bg-primary/25 text-lavender ring-primary/40" : "bg-foreground/10 text-foreground/80 ring-foreground/10")}><p.icon className="size-5" aria-hidden /></span>
                  <h3 className="text-xl font-extrabold">{def.name}</h3>
                </div>
                <p className="mt-3 text-sm text-foreground/75">{p.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span key={`${periodPrice}-${mode}`} className="fade-up text-5xl font-extrabold tracking-tight tabular-nums">{formatMoney(periodPrice, cur)}</span>
                  <span className="text-sm text-foreground/70">
                    {!paid ? "/ month" : mode === "one_time" ? `for 1 ${annual ? "year" : "month"}` : `/ ${annual ? "year" : "month"}`}
                  </span>
                </p>
                <p className="mt-1 h-4 text-left text-xs text-muted">
                  {!paid
                    ? "Free forever"
                    : mode === "one_time"
                      ? annual
                        ? `${perMonth}/mo equivalent · One-time prepaid`
                        : "One-time prepaid · No auto-renewal"
                      : annual
                        ? `${perMonth}/mo equivalent · Billed yearly (20% off)`
                        : "Billed monthly · Cancel anytime"}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{f}</li>)}
                </ul>
                <div className="mt-7">
                  {paid ? (
                    <ButtonLink href={href} variant={p.featured ? "primary" : "outline"} size="lg" className="w-full">
                      {mode === "one_time" ? `Buy ${def.name}` : `Upgrade to ${def.name}`} <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  ) : (
                    <ButtonLink href="/signup" variant="outline" size="lg" className="w-full border-lavender/50">Get Started Free <ArrowRight className="size-4" aria-hidden /></ButtonLink>
                  )}
                </div>
              </div>
            </Reveal>
          );
        })}
      </ul>
      <p className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-center text-sm text-foreground/70">
        <ShieldCheck className="size-4 shrink-0 text-lavender" aria-hidden />
        Payments powered by Razorpay (Cards, UPI, UPI QR &amp; NetBanking). Switch plans or cancel anytime from Billing.
      </p>
    </div>
  );
}

export function PricingBadge() {
  return <Badge tone="primary" className="rounded-full px-3 py-1">Pricing</Badge>;
}
