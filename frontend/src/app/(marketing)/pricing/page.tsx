import { ArrowRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PricingBadge, PricingPlans } from "@/components/marketing/pricing-plans";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with RelayNest. Compare the Free, Pro and Business plans for Telegram bot automation.",
};

const rows: [string, string, string, string][] = [
  ["Bots", "Up to 3", "Up to 20", "Up to 100"],
  ["Automation executions", "100 / month", "5,000 / month", "Unlimited"],
  ["Analytics history", "7 days", "30 days", "Custom"],
  ["Team members", "1", "Up to 5", "Unlimited"],
  ["Bot templates", "Basic", "All", "All"],
  ["Priority support", "-", "-", "Included"],
];

const faqs = [
  ["Is the Free plan really free?", "Yes. You can build and run up to 3 bots with basic automation at no cost, with no credit card."],
  ["What payment methods are supported?", "We support Cards, UPI, UPI QR (one-time), and NetBanking via Razorpay in INR (₹). USD ($) billing is coming soon."],
  ["What is the difference between Auto-renew and One-time?", "Auto-renew bills each month or year until you cancel. One-time (Prepaid) is the same rate paid once for a 1-month or 1-year pass with no auto-renewal."],
  ["Are AI features included?", "Yes. AI agents, the model catalog and the playground are available across plans, with usage tracked per workspace."],
];

function Cell({ v }: { v: string }) {
  return v === "-" ? <Minus className="mx-auto size-4 text-muted" aria-label="Not included" /> : v === "Included" ? <Check className="mx-auto size-5 text-ok" aria-label="Included" /> : <>{v}</>;
}

export default function PricingPage() {
  return (
    <div className="relative">
      <div className="orb -left-24 top-10 -z-10 size-[380px] bg-primary float-slow" aria-hidden />
      <div className="orb -right-24 top-60 -z-10 size-[340px] bg-info float" aria-hidden />

      <section className="mx-auto max-w-[1280px] px-4 pb-12 pt-14 text-center sm:px-6 lg:pt-20">
        <div className="fade-up"><PricingBadge /></div>
        <h1 className="mx-auto mt-5 max-w-3xl text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.06] tracking-tight">
          <SplitText text="Simple, transparent" delay={80} /> <SplitText text="pricing" rainbow delay={320} />
        </h1>
        <p className="fade-up mx-auto mt-4 max-w-xl text-lg text-foreground/75" style={{ "--d": "300ms" } as React.CSSProperties}>
          Start free and grow when you are ready. No hidden fees, and no credit card to get started.
        </p>
        <PricingPlans />
      </section>

      <section className="mx-auto max-w-[1000px] px-4 py-16 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-extrabold"><SplitText text="Compare" /> <SplitText text="plans" rainbow delay={150} /></h2>
          <p className="mt-2 text-foreground/75">See what is included in each plan.</p>
        </Reveal>
        <Reveal variant="zoom" className="card mt-8 overflow-x-auto p-2">
          <table className="rn-table min-w-[560px] text-center">
            <thead>
              <tr><th className="text-left">Feature</th><th className="text-center">Free</th><th className="text-center !text-lavender">Pro</th><th className="text-center">Business</th></tr>
            </thead>
            <tbody>
              {rows.map(([f, a, b, c]) => (
                <tr key={f}><td className="text-left font-semibold">{f}</td><td><Cell v={a} /></td><td><Cell v={b} /></td><td><Cell v={c} /></td></tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold"><SplitText text="Pricing" /> <SplitText text="questions" rainbow delay={150} /></h2>
        <div className="mt-8 space-y-3">
          {faqs.map(([q, a], i) => (
            <Reveal key={q} delay={i * 70}>
              <details className="card group p-4 transition hover:border-lavender/50 open:border-lavender/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden">{q}<span aria-hidden className="text-lavender transition-transform duration-300 group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-foreground/75">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-4 pb-24 pt-8 sm:px-6">
        <Reveal variant="zoom" className="animated-gradient flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-lavender/50 bg-gradient-to-r from-[#3B1FB8] via-[#5B34F0] to-[#2B5BE8] p-8 shadow-[0_0_80px_-25px_rgb(var(--rn-primary))] sm:p-10">
          <div><h2 className="text-2xl font-extrabold text-white sm:text-3xl">Ready to build your first bot?</h2><p className="mt-1 text-white/80">Create your free account and have a bot live in minutes.</p></div>
          <ButtonLink href="/signup" size="lg" className="bg-white text-[#3B1FB8] shadow-lg hover:bg-white [&]:bg-none">Get Started Free <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        </Reveal>
      </section>
    </div>
  );
}