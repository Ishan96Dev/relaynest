"use client";

import {
  ArrowRight, Bell, Bot, CheckCircle2, Filter, Headphones, HelpCircle, LayoutGrid, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { FullscreenMediaModal, FullscreenTriggerButton, type FullscreenMediaItem } from "@/components/ui/media-fullscreen-modal";
import { cn } from "@/lib/utils";

type Category = "All" | "Support & FAQ" | "Community & Alerts" | "Growth & AI";

interface TemplateCard {
  id: string;
  name: string;
  category: Exclude<Category, "All">;
  tone: TileTone;
  popular?: boolean;
  icon: LucideIcon;
  summary: string;
  commands: string[];
  exampleReply: string;
  bestFor: string;
}

const TEMPLATES: TemplateCard[] = [
  {
    id: "customer-support",
    name: "Customer Support Bot",
    category: "Support & FAQ",
    tone: "info",
    popular: true,
    icon: Headphones,
    summary: "Greet customers, collect issue descriptions step-by-step, and route urgent requests straight to your support team.",
    commands: ["/start", "/ticket", "/status", "/help"],
    exampleReply: "Hi! Please choose a topic below or share your order ID so we can help right away.",
    bestFor: "SaaS teams, online stores & agencies",
  },
  {
    id: "faq-bot",
    name: "Smart FAQ Bot",
    category: "Support & FAQ",
    tone: "primary",
    icon: HelpCircle,
    summary: "Answer common pricing, shipping, setup, and policy questions instantly using quick-reply menus or your Knowledge Base.",
    commands: ["/start", "/pricing", "/docs", "/contact"],
    exampleReply: "You can start free with up to 3 bots and upgrade anytime inside Billing.",
    bestFor: "Product teams & solo founders",
  },
  {
    id: "notification-bot",
    name: "Notification & Alerts Bot",
    category: "Community & Alerts",
    tone: "amber",
    icon: Bell,
    summary: "Send release announcements, order alerts, uptime pings, or scheduled updates directly to subscribers or channels.",
    commands: ["/subscribe", "/updates", "/mute"],
    exampleReply: "New Update v2.4 is now live! Tap below to read the changelog.",
    bestFor: "Product updates, releases & ops teams",
  },
  {
    id: "community-bot",
    name: "Community Management Bot",
    category: "Community & Alerts",
    tone: "success",
    icon: Users,
    summary: "Welcome new members into your Telegram group automatically, share group guidelines, and highlight key resources.",
    commands: ["/welcome", "/rules", "/links"],
    exampleReply: "Welcome to the group! Introduce yourself and check /rules to get started.",
    bestFor: "Creators, courses & developer groups",
  },
  {
    id: "lead-bot",
    name: "Lead Collection Bot",
    category: "Growth & AI",
    tone: "warning",
    icon: Filter,
    summary: "Ask qualifying questions conversationally inside Telegram and organize interested prospects for fast follow-up.",
    commands: ["/start", "/quote", "/book"],
    exampleReply: "Thanks! What team size are you looking to automate for so we can recommend the right plan?",
    bestFor: "B2B sales, consultants & agencies",
  },
  {
    id: "ai-assistant",
    name: "AI Knowledge Assistant",
    category: "Growth & AI",
    tone: "cyan",
    popular: true,
    icon: Sparkles,
    summary: "Powered by NVIDIA, Google, Meta, or Mistral models and trained directly on your uploaded PDFs and help guides.",
    commands: ["/start", "/ask", "/summarize", "/reset"],
    exampleReply: "Based on your onboarding PDF, paste your @BotFather token in Step 1 to connect your bot.",
    bestFor: "24/7 AI support, internal docs & onboarding",
  },
];

const CATEGORIES: Category[] = ["All", "Support & FAQ", "Community & Alerts", "Growth & AI"];

export function TemplatesShowcase() {
  const [cat, setCat] = React.useState<Category>("All");
  const [fsOpen, setFsOpen] = React.useState(false);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);
  const visible = React.useMemo(
    () => (cat === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === cat)),
    [cat],
  );
  const templatesMedia: FullscreenMediaItem = {
    kind: "image",
    src: "/images/docs/pages/templates.png",
    alt: "RelayNest Bot Templates gallery inside the workspace",
    pageTitle: "Bot Templates Gallery (/bots/templates)",
    caption: "Bot Templates (/bots/templates): preview any template's commands, requirements, and Telegram reply simulation before launching.",
  };

  return (
    <div className="relative">
      <div className="orb -left-24 top-10 -z-10 size-[380px] bg-primary float-slow" aria-hidden />
      <div className="orb -right-24 top-60 -z-10 size-[360px] bg-info float" aria-hidden />

      <section className="mx-auto max-w-[1280px] px-4 pb-10 pt-14 text-center sm:px-6 lg:pt-20">
        <Reveal>
          <Badge tone="primary" className="rounded-full px-3.5 py-1.5 text-xs">
            <LayoutGrid className="size-3.5" aria-hidden /> Ready-to-Use Bot Templates
          </Badge>
        </Reveal>
        <h1 className="mx-auto mt-5 max-w-3xl text-[clamp(2.1rem,4.6vw,3.5rem)] font-extrabold leading-[1.06] tracking-tight">
          <SplitText text="Launch Faster with" delay={80} /> <SplitText text="Bot Templates" rainbow delay={260} />
        </h1>
        <p className="fade-up mx-auto mt-4 max-w-2xl text-base text-foreground/75 sm:text-lg" style={{ "--d": "260ms" } as React.CSSProperties}>
          Pick a pre-built template, connect your Telegram bot token, customize any message or AI prompt, and go live in minutes.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                cat === c
                  ? "border-lavender bg-primary/25 text-lavender"
                  : "border-border bg-surface/70 text-foreground/75 hover:border-lavender/50 hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* REAL IN-APP SCREENSHOT PREVIEW */}
      <section className="mx-auto max-w-[1100px] px-4 pb-12 sm:px-6">
        <Reveal variant="zoom" className="card-glow group relative overflow-hidden p-2 shadow-[0_0_80px_-25px_rgb(var(--rn-primary))]">
          <FullscreenTriggerButton
            label="View Bot Templates workspace screenshot in full screen"
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              setFsOpen(true);
            }}
            className="absolute right-4 top-4 z-10"
          />
          <Image
            src="/images/docs/pages/templates.png"
            alt="RelayNest Bot Templates gallery inside the workspace"
            width={1440}
            height={900}
            priority
            className="h-auto w-full rounded-xl"
          />
        </Reveal>
      </section>

      {/* TEMPLATE CARDS */}
      <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={t.id} delay={(i % 3) * 80}>
                <SpotlightCard className="flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <IconTile tone={t.tone} size="lg"><Icon /></IconTile>
                    <div className="flex items-center gap-1.5">
                      {t.popular && <Badge tone="primary">Popular</Badge>}
                      <Badge tone="neutral">{t.category}</Badge>
                    </div>
                  </div>

                  <h2 className="mt-4 text-xl font-extrabold">{t.name}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">{t.summary}</p>

                  <div className="mt-4 rounded-xl border border-border/70 bg-surface-2/80 p-3.5 text-xs">
                    <p className="font-semibold text-lavender">Sample Telegram Reply</p>
                    <p className="mt-1 italic text-foreground/85">&ldquo;{t.exampleReply}&rdquo;</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {t.commands.map((cmd) => (
                      <span key={cmd} className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-xs text-accent">
                        {cmd}
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                    <CheckCircle2 className="size-3.5 text-ok" aria-hidden /> Best for: {t.bestFor}
                  </p>

                  <div className="mt-auto pt-5">
                    <ButtonLink href="/signup" variant="subtle" className="w-full justify-between">
                      <span>Use {t.name}</span>
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </div>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="mx-auto max-w-[1280px] px-4 pb-24 pt-12 sm:px-6">
        <Reveal variant="zoom" className="animated-gradient flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-lavender/50 bg-gradient-to-r from-[#3B1FB8] via-[#5B34F0] to-[#2B5BE8] p-8 sm:p-10">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <Bot className="size-7" aria-hidden />
            </span>
            <div>
              <h2 className="text-2xl font-extrabold text-white">Prefer to start from scratch?</h2>
              <p className="mt-1 text-white/80">Connect any Telegram bot token or customize an AI agent directly in minutes.</p>
            </div>
          </div>
          <ButtonLink href="/signup" size="lg" className="bg-white text-[#3B1FB8] shadow-lg hover:bg-white [&]:bg-none">
            Create Free Bot <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </section>

      {fsOpen && (
        <FullscreenMediaModal
          items={[templatesMedia]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => {
            setFsOpen(false);
            requestAnimationFrame(() => openerRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
