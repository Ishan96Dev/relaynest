"use client";

import {
  ArrowRight, BarChart3, Bell, BookOpen, Bot, Check, Cpu, CreditCard, KeyRound,
  LayoutGrid, MessageSquare, Play, Puzzle, Send, ShieldCheck, Sparkles, Workflow,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import {
  FullscreenMediaModal, FullscreenTriggerButton, PRODUCT_VIDEO_MEDIA, type FullscreenMediaItem,
} from "@/components/ui/media-fullscreen-modal";
import { useScrollSpy } from "@/components/ui/use-scroll-spy";
import { cn } from "@/lib/utils";

const HIGHLIGHTS: Array<{
  id: string;
  navLabel: string;
  badge: string;
  title: string;
  subtitle: string;
  tone: TileTone;
  icon: typeof Bot;
  image: { src: string; alt: string };
  points: string[];
}> = [
  {
    id: "bots",
    navLabel: "Bot Management",
    badge: "Bot Management",
    title: "Connect & Configure Telegram Bots in Minutes",
    subtitle: "Link your bot straight from Telegram's @BotFather, sync its real display name, bio, and profile photo automatically, and manage multiple bots from one clean workspace.",
    tone: "primary",
    icon: Send,
    image: { src: "/images/docs/pages/bots.png", alt: "RelayNest My Bots workspace listing connected Telegram bots and lifecycle history" },
    points: [
      "Two-way Telegram synchronization with deleted-on-Telegram detection",
      "Publish Telegram slash commands (/start, /help, /pricing) directly from the UI",
      "Cleanly wipe Telegram webhooks, commands & photos upon deletion with Bot History audit",
      "Encrypted bot token vault — tokens are never exposed in plain text after saving",
    ],
  },
  {
    id: "workflows",
    navLabel: "Visual Automation",
    badge: "Visual Automation",
    title: "Build Smart Bot Flows Without Code",
    subtitle: "Design interactive Telegram conversations using an intuitive drag-and-drop canvas. Combine triggers, branching rules, rich buttons, and external apps cleanly.",
    tone: "cyan",
    icon: Workflow,
    image: { src: "/images/docs/pages/workflow-editor.png", alt: "RelayNest Visual Workflow Automation builder canvas" },
    points: [
      "Trigger flows on Telegram commands, message keywords, or recurring schedules",
      "Split logic cleanly with Conditions (VIP users, onboarding answers, keywords)",
      "Send formatted replies, interactive inline buttons, or external HTTP actions",
      "Inspect every single workflow run step-by-step in Execution History",
    ],
  },
  {
    id: "ai",
    navLabel: "AI & Knowledge",
    badge: "AI Platform & Knowledge",
    title: "AI Agents Grounded in Your Own Docs & FAQs",
    subtitle: "Give your Telegram bot a smart AI assistant powered by top global models, backed directly by your PDFs, product manuals, and company FAQs.",
    tone: "info",
    icon: Sparkles,
    image: { src: "/images/docs/pages/ai-agents.png", alt: "RelayNest AI Agents studio and configuration view" },
    points: [
      "Browse NVIDIA, Google, Meta, Mistral, and partner models in Model Catalog",
      "Test prompts, tone, and model responses side-by-side in Model Playground",
      "Upload PDF, Markdown, TXT, or web docs to Knowledge Base for cited replies",
      "Preview real conversations live in the dashboard before publishing to Telegram",
    ],
  },
  {
    id: "analytics",
    navLabel: "Analytics & Control",
    badge: "Analytics & Control",
    title: "Track Growth, Alerts & Workspace Health",
    subtitle: "Monitor every incoming Telegram message, workflow success rate, and AI token trend in clear charts — paired with instant notifications and clear plan tracking.",
    tone: "success",
    icon: BarChart3,
    image: { src: "/images/docs/pages/analytics.png", alt: "RelayNest Analytics dashboard showing executions, messages and AI usage charts" },
    points: [
      "Unified Overview dashboard with active bot status and quick actions",
      "Detailed charts for message volume, workflow runs, and response time",
      "Real-time notification bell alerts for bot connects, edits, and billing updates",
      "Transparent Free, Pro, and Business plans with Card & UPI QR payments",
    ],
  },
  {
    id: "api-integrations",
    navLabel: "APIs & Integrations",
    badge: "APIs & Swagger UI",
    title: "Scoped API Keys, Signed Webhooks & Live Swagger UI",
    subtitle: "Integrate external backends, Slack, Discord, or custom dashboards securely via SHA-256 hashed API keys, interactive Swagger UI testing, and instant workspace notifications.",
    tone: "info",
    icon: KeyRound,
    image: { src: "/images/docs/pages/api-swagger-ui.png", alt: "RelayNest interactive Swagger UI testing live analytics endpoint with HTTP 200 JSON output" },
    points: [
      "Create scoped rnk_live_ API keys backed by Supabase DB",
      "Authorize tokens inside In-App Swagger UI (/api-docs) without leaving your workspace",
      "Connect Slack, Discord, and signed HTTPS webhooks with one-click Test Ping",
      "Receive instant Bell alerts & 7-day request telemetry logs",
    ],
  },
];

const NAV_SECTIONS = [
  ...HIGHLIGHTS.map((h) => ({ id: h.id, label: h.navLabel })),
  { id: "capabilities", label: "Complete Toolkit" },
];

const EXTRA_CAPABILITIES = [
  { icon: LayoutGrid, title: "Starter Bot Templates", desc: "Start fast with proven templates for Customer Support, FAQ, Community, Notifications, and Lead Capture." },
  { icon: BookOpen, title: "Document Knowledge Base", desc: "Upload PDFs, help articles, and company policies so your bots always share verified, up-to-date answers." },
  { icon: Cpu, title: "Model Playground", desc: "Compare responses from different AI models in real time before picking one for your Telegram audience." },
  { icon: Bell, title: "Smart Notifications", desc: "Customize in-app and email alerts for bot activity, new logins, failed runs, and monthly billing renewals." },
  { icon: Puzzle, title: "Connected Integrations", desc: "Manage Telegram bots, webhooks, API keys, and connected services in one workspace hub." },
  { icon: ShieldCheck, title: "Security & Activity Trail", desc: "Keep teams safe with login alerts, API key controls, workspace roles, and transparent activity logs." },
  { icon: KeyRound, title: "Scoped API Keys", desc: "Generate API keys to trigger flows or inspect statuses programmatically whenever your team needs custom hooks." },
  { icon: CreditCard, title: "USD & INR Flexible Billing", desc: "Start free forever, or upgrade monthly/annually (20% off) via auto-renew subscription, one-time pass, or UPI QR." },
] as const;

export function FeaturesShowcase() {
  const sectionIds = React.useMemo(() => NAV_SECTIONS.map((s) => s.id), []);
  const [activeId, setActiveId] = useScrollSpy(sectionIds, { topOffset: 150 });
  const [lightbox, setLightbox] = React.useState<{ items: FullscreenMediaItem[]; index: number } | null>(null);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  const featureMedia = React.useMemo<FullscreenMediaItem[]>(
    () => [
      ...HIGHLIGHTS.map((h) => ({
        kind: "image" as const,
        src: h.image.src,
        alt: h.image.alt,
        pageTitle: `${h.badge} · ${h.navLabel}`,
        caption: `${h.badge}: ${h.title}`,
      })),
      PRODUCT_VIDEO_MEDIA,
    ],
    [],
  );

  function openFs(e: React.MouseEvent<HTMLButtonElement>, idx: number) {
    openerRef.current = e.currentTarget;
    setLightbox({ items: featureMedia, index: idx });
  }

  return (
    <div className="relative">
      <div className="orb -left-28 top-12 -z-10 size-[420px] bg-primary float-slow" aria-hidden />
      <div className="orb -right-24 top-80 -z-10 size-[380px] bg-accent/60 float" aria-hidden />

      {/* HERO */}
      <section className="mx-auto max-w-[1280px] px-4 pb-10 pt-14 text-center sm:px-6 lg:pt-20">
        <Reveal>
          <Badge tone="primary" className="rounded-full px-3.5 py-1.5 text-xs">
            <MessageSquare className="size-3.5" aria-hidden /> Complete Product Capabilities
          </Badge>
        </Reveal>
        <h1 className="mx-auto mt-5 max-w-4xl text-[clamp(2.1rem,4.6vw,3.6rem)] font-extrabold leading-[1.06] tracking-tight">
          <SplitText text="Everything You Need to" delay={80} />{" "}
          <SplitText text="Build & Automate" rainbow delay={260} />{" "}
          <SplitText text="on Telegram" delay={420} />
        </h1>
        <p className="fade-up mx-auto mt-4 max-w-2xl text-base text-foreground/75 sm:text-lg" style={{ "--d": "260ms" } as React.CSSProperties}>
          From your very first Telegram bot setup to visual automation flows, document-backed AI assistants, and clear analytics — every tool lives inside one unified workspace.
        </p>
        <div className="fade-up mt-7 flex flex-wrap items-center justify-center gap-3" style={{ "--d": "360ms" } as React.CSSProperties}>
          <ButtonLink href="/signup" size="lg" className="px-6">
            Start Free Today <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <Button type="button" variant="subtle" size="lg" className="px-6" onClick={(e) => openFs(e, HIGHLIGHTS.length)}>
            <Play className="size-4" aria-hidden /> Watch Product Video (Full Screen)
          </Button>
          <ButtonLink href="/docs" variant="outline" size="lg" className="px-6">
            Read User Guides
          </ButtonLink>
        </div>
      </section>

      {/* STICKY SCROLL-SPY SECTION JUMP BAR */}
      <div className="sticky top-16 z-30 border-y border-border/60 bg-background/85 backdrop-blur-md">
        <nav aria-label="Feature categories" className="mx-auto flex max-w-[1280px] items-center justify-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
          {NAV_SECTIONS.map((sec) => {
            const active = activeId === sec.id;
            return (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                aria-current={active ? "true" : undefined}
                onClick={() => setActiveId(sec.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "border border-border/80 bg-surface-2/70 text-foreground/80 hover:border-lavender/50 hover:text-lavender",
                )}
              >
                {sec.label}
              </a>
            );
          })}
        </nav>
      </div>

      {/* DEEP DIVES WITH FULLSCREEN BUTTONS */}
      <section className="mx-auto max-w-[1280px] space-y-20 px-4 py-12 sm:px-6 lg:py-16">
        {HIGHLIGHTS.map((item, idx) => {
          const Icon = item.icon;
          const reverse = idx % 2 === 1;
          return (
            <div key={item.id} id={item.id} className="grid scroll-mt-32 items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <Reveal variant={reverse ? "right" : "left"} className={reverse ? "lg:order-2" : undefined}>
                <div className="flex items-center gap-3">
                  <IconTile tone={item.tone} size="md"><Icon /></IconTile>
                  <Badge tone={item.tone === "success" ? "success" : "primary"} className="rounded-full px-3 py-1">{item.badge}</Badge>
                </div>
                <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-[36px]">{item.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-foreground/80">{item.subtitle}</p>
                <ul className="mt-5 space-y-2.5">
                  {item.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal variant={reverse ? "left" : "right"} className={reverse ? "lg:order-1" : undefined}>
                <div className="card-glow group relative overflow-hidden p-2 shadow-[0_0_70px_-24px_rgb(var(--rn-primary))]">
                  <FullscreenTriggerButton
                    label={`View full screen: ${item.title}`}
                    onClick={(e) => openFs(e, idx)}
                    className="absolute right-4 top-4 z-10"
                  />
                  <Image
                    src={item.image.src}
                    alt={item.image.alt}
                    width={1440}
                    height={900}
                    className="h-auto w-full rounded-xl"
                  />
                </div>
              </Reveal>
            </div>
          );
        })}
      </section>

      {/* GRID OF ALL PLATFORM TOOLS */}
      <section id="capabilities" className="mx-auto max-w-[1280px] scroll-mt-32 px-4 py-16 sm:px-6">
        <div className="text-center">
          <Badge tone="primary" className="rounded-full px-3 py-1">Complete Toolkit</Badge>
          <h2 className="mt-3 text-3xl font-extrabold sm:text-[40px]">
            <SplitText text="Every Screen Built for" /> <SplitText text="Everyday Clarity" rainbow delay={180} />
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-foreground/75">No scattered dashboards or complex server scripts — manage every piece visually.</p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EXTRA_CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <Reveal as="li" key={cap.title} delay={(idx % 4) * 70}>
                <SpotlightCard className="h-full p-5">
                  <IconTile tone="primary" size="md"><Icon /></IconTile>
                  <h3 className="mt-3.5 font-bold">{cap.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{cap.desc}</p>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </ul>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6">
        <Reveal variant="zoom" className="animated-gradient flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-lavender/50 bg-gradient-to-r from-[#3B1FB8] via-[#5B34F0] to-[#2B5BE8] p-8 shadow-[0_0_80px_-25px_rgb(var(--rn-primary))] sm:p-10">
          <div>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">Ready to launch your first bot?</h2>
            <p className="mt-1 text-white/80">Start with 3 bots and 100 monthly automation runs free — upgrade whenever you grow.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/templates" variant="outline" size="lg" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
              Browse Templates
            </ButtonLink>
            <ButtonLink href="/signup" size="lg" className="bg-white text-[#3B1FB8] shadow-lg hover:bg-white [&]:bg-none">
              Get Started Free <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      {lightbox && (
        <FullscreenMediaModal
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(idx) => setLightbox((prev) => (prev ? { ...prev, index: idx } : null))}
          onClose={() => {
            setLightbox(null);
            requestAnimationFrame(() => openerRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
