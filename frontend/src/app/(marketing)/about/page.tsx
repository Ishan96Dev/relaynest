import type { Metadata } from "next";
import { ArrowRight, Bot, Lock, Mail, Phone, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { GITHUB_URL, GitHubIcon, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/components/marketing/legal-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata: Metadata = {
  title: "About RelayNest",
  description: "Learn how RelayNest helps founders, communities, and teams build, sync, and automate Telegram bots and AI assistants with zero code.",
};

const PILLARS = [
  {
    icon: Bot,
    title: "Built for Telegram First",
    desc: "From guided @BotFather setup to instant two-way profile & deletion synchronization, every detail is tailored cleanly around Telegram.",
  },
  {
    icon: Workflow,
    title: "Deterministic Visual Automation",
    desc: "Combine triggers, condition branches, scheduled broadcasts, and signed webhooks visually before adding conversational AI.",
  },
  {
    icon: Sparkles,
    title: "Grounded, Responsible AI",
    desc: "Upload PDFs, guides, and FAQs into Knowledge Base collections and test replies live in Model Playground before customers see them.",
  },
  {
    icon: Lock,
    title: "Encrypted & Audited by Design",
    desc: "Envelope-encrypted bot tokens, strict workspace isolation, and full Bot Lifecycle History so you always know what changed.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-surface/85 p-6 shadow-[0_0_80px_-28px_rgb(var(--rn-primary))] sm:p-10">
        <Badge tone="primary" className="rounded-full px-3 py-1">About RelayNest</Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Making Telegram Automation Simple, Reliable &amp; Transparent
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground/80">
          RelayNest brings visual Telegram bot creation, real-time two-way bot synchronization, reusable templates, Knowledge Base AI assistants, and clear lifecycle auditing together in one intuitive workspace — built so anyone can launch dependable automation without touching server code.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/features" size="md">Explore Features <ArrowRight className="size-4" /></ButtonLink>
          <ButtonLink href="/docs" variant="outline" size="md">Read Documentation</ButtonLink>
          <ButtonLink href="/contact" variant="subtle" size="md">Contact Team</ButtonLink>
        </div>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.title} className="p-6">
              <IconTile tone="primary" size="lg"><Icon /></IconTile>
              <h2 className="mt-4 text-xl font-bold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{p.desc}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-10 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lavender">
            <RefreshCw className="size-3.5" aria-hidden /> Direct Human Support
          </div>
          <h2 className="mt-2 text-2xl font-extrabold">Questions, Partnerships, or Custom Bot Ideas?</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            RelayNest is backed directly by responsive engineering and support. Whether you need onboarding guidance, enterprise quotes, or Responsible AI reviews, reach us directly.
          </p>
        </div>
        <div className="space-y-3 rounded-2xl border border-border/80 bg-surface-2/80 p-5 text-sm">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2.5 font-semibold hover:text-lavender">
            <Mail className="size-4 text-lavender" /> {SUPPORT_EMAIL}
          </a>
          <a href={SUPPORT_PHONE_HREF} className="flex items-center gap-2.5 font-semibold hover:text-lavender">
            <Phone className="size-4 text-lavender" /> {SUPPORT_PHONE}
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 font-semibold hover:text-lavender">
            <GitHubIcon className="size-4 text-lavender" /> GitHub · Ishan96Dev/relaynest
          </a>
        </div>
      </Card>
    </div>
  );
}
