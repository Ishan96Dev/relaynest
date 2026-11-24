import {
  Activity, ArrowRight, BarChart3, Bell, BookOpen, Bot, Check, ChevronDown, Code2, Cpu, Database, Filter, Headphones, HelpCircle, KeyRound, Layers,
  LayoutGrid, MessageSquare, Plug, Rocket, Send, Sparkles, UserPlus, Users, Workflow, type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { CountUp } from "@/components/motion/count-up";
import { MediaPreviewFrame } from "@/components/marketing/media-preview-frame";
import { ProductVideoSection } from "@/components/marketing/product-video";
import { Reveal } from "@/components/motion/reveal";
import { ScrollFillText } from "@/components/motion/scroll-fill-text";
import { SplitText } from "@/components/motion/split-text";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Tilt } from "@/components/motion/tilt";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";

const strip: [LucideIcon, string, string][] = [
  [Layers, "Multiple Bot", "Management"], [Code2, "No-Code", "Configuration"], [LayoutGrid, "Reusable", "Bot Templates"], [Activity, "Real-Time", "Activity Monitoring"], [KeyRound, "Secure", "Bot Token Management"],
];

const features: [LucideIcon, string, string][] = [
  [Send, "Telegram Bot Management", "Connect, configure and manage multiple Telegram bots from a single dashboard with two-way live sync."],
  [LayoutGrid, "Bot Templates", "Kickstart with ready-to-use templates for support, notifications, communities and more."],
  [Layers, "Custom Bot Builder", "Build your own bot visually with triggers, commands, responses and integrations."],
  [Workflow, "Workflow Automation", "Automate conversations, tasks and user actions with an easy, no-code workflow builder."],
  [BarChart3, "Analytics & Monitoring", "Track executions, user interactions, command usage and bot performance in real time."],
  [BookOpen, "Knowledge Base Management", "Add your own data (docs, FAQs, policies) to your AI agents for smarter, context-aware answers."],
  [Plug, "Slack, Discord & Webhooks", "Connect outbound Slack/Discord channels and trigger workflows from signed incoming HTTPS webhooks."],
  [KeyRound, "Workspace API & Swagger UI", "Generate scoped production API keys and test live workspace endpoints inside your in-app Swagger UI."],
  [Bell, "Real-Time Alerts & Bell Feed", "Receive instant in-app notifications for bot sync events, API key changes, and billing updates."],
];

const steps: [LucideIcon, string, string, string][] = [
  [UserPlus, "Create Your Account", "Sign up on RelayNest and set up your workspace.", "from-[#7C5CFF] to-[#6C47FF]"],
  [Send, "Connect Your Bot", "Link your Telegram bot using a secure bot token.", "from-[#3B82F6] to-[#2563EB]"],
  [Layers, "Configure Automation", "Add commands, responses and automation workflows.", "from-[#8B5CF6] to-[#6C47FF]"],
  [Rocket, "Publish & Monitor", "Go live and track your bot's performance in real time.", "from-[#22D3EE] to-[#0EA5E9]"],
];

const templates: [LucideIcon, string, string, TileTone, boolean][] = [
  [Headphones, "Customer Support Bot", "Handle user queries, tickets and support requests.", "info", true],
  [HelpCircle, "FAQ Bot", "Answer frequently asked questions automatically.", "info", false],
  [Bell, "Notification Bot", "Send updates, alerts and announcements to your users.", "amber", false],
  [Users, "Community Management Bot", "Manage members, welcome new users and enforce rules.", "success", false],
  [Filter, "Lead Collection Bot", "Collect and organize leads directly from Telegram.", "warning", false],
  [Sparkles, "Personal Assistant Bot", "A smart assistant for tasks, reminders and quick info.", "primary", false],
];

const faqs = [
  ["Do I need to know how to code?", "No. You configure bots with forms and a visual workflow builder."],
  ["Where is my bot token stored?", "Encrypted on our servers with AES-256-GCM. It is never shown again after you save it."],
  ["Is AI included?", "Yes. Create AI agents that answer on Telegram, choose from the model catalog, try models in the Playground and give agents your own knowledge. You bring your own provider keys."],
  ["Can I use more than one bot?", "Yes. Each workspace can manage multiple Telegram bots."],
];

function SectionTitle({ badge, pre, accent, post, sub }: { badge: string; pre?: string; accent: string; post?: string; sub?: string }) {
  return (
    <div className="text-center">
      <Reveal><Badge tone="primary" className="rounded-full px-3 py-1">{badge}</Badge></Reveal>
      <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-extrabold leading-tight sm:text-[40px]">
        {pre && <><SplitText text={pre} />{" "}</>}
        <SplitText text={accent} rainbow delay={pre ? 220 : 0} />
        {post && <>{" "}<SplitText text={post} delay={420} /></>}
      </h2>
      {sub && <Reveal delay={200}><p className="mx-auto mt-2 max-w-xl text-foreground/75">{sub}</p></Reveal>}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <div className="orb -left-24 top-10 -z-10 size-[420px] bg-primary float-slow" aria-hidden />
        <div className="orb -right-24 top-40 -z-10 size-[380px] bg-info float" aria-hidden />
        <div className="hero-grid -z-10" aria-hidden />
        <div className="grid-cols-1 mx-auto grid max-w-[1280px] items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <div className="fade-up" style={{ "--d": "0ms" } as React.CSSProperties}>
              <Badge tone="primary" className="rounded-full px-3.5 py-1.5 text-xs"><Send className="size-3.5" aria-hidden />No-Code Telegram Bot Platform</Badge>
            </div>
            <h1 className="mt-5 text-[clamp(2.2rem,4.2vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
              <SplitText as="span" text="Build Telegram Bots." className="block lg:whitespace-nowrap" delay={100} />{" "}
              <SplitText as="span" text="Automate Everything." rainbow className="block lg:whitespace-nowrap" delay={400} />
            </h1>
            <p className="fade-up mt-5 max-w-[520px] text-[17px] leading-relaxed text-foreground/80" style={{ "--d": "220ms" } as React.CSSProperties}>
              Create, configure, and manage powerful Telegram bots from one simple platform. Connect your bots, automate conversations, and manage everything from a unified dashboard.
            </p>
            <div className="fade-up mt-8 flex flex-wrap items-center gap-3" style={{ "--d": "340ms" } as React.CSSProperties}>
              <ButtonLink href="/signup" size="lg" className="px-5">Start Building <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></ButtonLink>
              <ButtonLink href="/#product-video" variant="subtle" size="lg" className="border-lavender/50 px-5">Watch Product Video</ButtonLink>
              <ButtonLink href="/features" variant="outline" size="lg" className="border-border px-5 hover:border-lavender/60">Explore Features</ButtonLink>
            </div>
            <ul className="fade-up mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/80" style={{ "--d": "440ms" } as React.CSSProperties}>
              {["No-code", "Fast setup", "Scalable"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-ok" aria-hidden />{t}</li>)}
            </ul>
          </div>

          <div className="fade-up relative" style={{ "--d": "300ms" } as React.CSSProperties}>
            <Tilt max={7}>
              <MediaPreviewFrame
                src="/images/dashboard-preview.webp"
                alt="RelayNest dashboard showing bots, an automation workflow, and an execution trend"
                caption="RelayNest Dashboard — Unified control over bots, workflows, execution trends, and activity."
                width={1400}
                height={788}
                priority
                sizes="(min-width: 1024px) 640px, 100vw"
                className="card-glow p-1.5 shadow-[0_0_90px_-24px_rgb(var(--rn-primary))]"
              />
              <div className="tilt-layer float absolute -left-3 top-8 hidden sm:block lg:-left-10" style={{ "--z": "70px" } as React.CSSProperties} aria-hidden>
                <div className="card flex items-center gap-3 px-4 py-3 shadow-xl">
                  <span className="pulse-dot size-2.5 rounded-full bg-success" />
                  <div className="leading-tight"><p className="text-sm font-bold">SupportBot</p><p className="text-[11px] text-muted">@relay_support_bot &middot; Online</p></div>
                </div>
              </div>
              <div className="tilt-layer float-slow absolute -right-2 bottom-10 hidden sm:block lg:-right-8" style={{ "--z": "90px" } as React.CSSProperties} aria-hidden>
                <div className="card flex items-center gap-3 px-4 py-3 shadow-xl">
                  <IconTile tone="info" size="md"><MessageSquare /></IconTile>
                  <div className="leading-tight"><p className="text-lg font-extrabold"><CountUp value="12,430" /></p><p className="text-[11px] text-muted">Messages processed</p></div>
                </div>
              </div>
              <Image src="/images/telegram-badge.webp" alt="" width={560} height={373} className="tilt-layer float absolute -right-6 -top-10 hidden w-28 drop-shadow-[0_18px_30px_rgba(60,60,255,0.45)] lg:block" style={{ "--z": "110px" } as React.CSSProperties} aria-hidden />
            </Tilt>
          </div>
        </div>
        <p className="relative flex flex-col items-center gap-1.5 pb-8 text-xs text-foreground/70">
          <a href="#highlights" className="grid-cols-1 group grid size-8 place-items-center rounded-full border border-border bg-surface/70 transition hover:border-lavender/60" aria-label="Scroll to highlights"><ChevronDown className="size-4 animate-bounce" aria-hidden /></a>Scroll to explore 
        </p>
      </section>

      {/* HIGHLIGHTS */}
      <section id="highlights" aria-label="Highlights" className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal as="ul" variant="zoom" className="grid-cols-1 card grid gap-1 p-2 sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-border/60">
          {strip.map(([I, a, b]) => (
            <li key={a} className="group flex items-center gap-3 rounded-xl px-4 py-3 transition hover:bg-primary/10">
              <I className="size-7 shrink-0 text-lavender transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110" aria-hidden />
              <span className="text-sm font-semibold leading-tight">{a}<br />{b}</span>
            </li>
          ))}
        </Reveal>
      </section>

      {/* STATEMENT: words light up as you scroll */}
      <section aria-label="Why RelayNest" className="mx-auto max-w-[1100px] px-4 pt-24 sm:px-6 lg:pt-32">
        <ScrollFillText
          className="text-center text-[clamp(1.6rem,3.6vw,3rem)] font-extrabold leading-[1.18] tracking-tight"
          text="Stop wiring bots together by hand. Build, connect and automate Telegram in minutes, with no code, no servers and no guesswork."
          accent={["Build", "connect", "automate", "Telegram"]}
        />
      </section>

      {/* PRODUCT VIDEO */}
      <ProductVideoSection />

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-20 sm:px-6 lg:py-28">
        <SectionTitle badge="Features" pre="Everything You Need to" accent="Build & Automate" post="Telegram Bots" sub="A complete toolkit to create, automate and scale Telegram bots without writing code." />
        <ul className="grid-cols-1 mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([I, t, d], i) => (
            <Reveal as="li" key={t} delay={(i % 3) * 90}>
              <SpotlightCard className="h-full p-6">
                <div className="group flex items-start gap-4">
                  <IconTile tone="primary" size="lg" className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><I /></IconTile>
                  <div className="flex-1"><h3 className="font-bold">{t}</h3><p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{d}</p></div>
                  <ArrowRight className="mt-1 size-4 text-foreground/60 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-lavender" aria-hidden />
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-8 sm:px-6 lg:py-12">
        <SectionTitle badge="How It Works" pre="Get Your Telegram Bot Live in" accent="4 Simple Steps" sub="From sign-up to a fully automated bot, it takes just a few minutes." />
        <ol className="grid-cols-1 relative mt-14 grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <Reveal variant="draw" className="absolute left-[12.5%] right-[12.5%] top-8 hidden h-px bg-gradient-to-r from-lavender/10 via-lavender to-accent/10 md:block" aria-hidden />
          {steps.map(([I, t, d, g], i) => (
            <Reveal as="li" key={t} delay={i * 140} className="group relative text-center">
              <span className={`relative z-10 mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b ${g} shadow-[0_0_34px_-6px_rgb(var(--rn-primary))] ring-4 ring-background transition-transform duration-500 group-hover:-translate-y-1.5 group-hover:scale-110 group-hover:rotate-[8deg]`} aria-hidden><I className="size-7 text-white" /></span>
              <h3 className="mt-5 font-bold">{i + 1}. {t}</h3><p className="mx-auto mt-1 max-w-[230px] text-sm text-foreground/75">{d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* TEMPLATES */}
      <section id="templates" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div><Badge tone="primary" className="rounded-full px-3 py-1">Popular Templates</Badge>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-[40px]"><SplitText text="Kickstart with" /> <SplitText text="Ready-to-Use Bot Templates" rainbow delay={200} /></h2><p className="mt-1 text-foreground/75">Pre-built, fully customizable templates for common use cases.</p></div>
          <ButtonLink href="/templates" variant="outline" className="border-lavender/50">View All Templates <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        </Reveal>
        <ul className="grid-cols-1 mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {templates.map(([I, t, d, tone, pop], i) => (
            <Reveal as="li" key={t} delay={i * 70} variant="zoom">
              <SpotlightCard className="h-full p-4">
                <div className="group flex h-full flex-col gap-2">
                  {pop && <Badge tone="primary" className="absolute right-0 top-0">Popular</Badge>}
                  <IconTile tone={tone} size="md" className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"><I /></IconTile>
                  <h3 className="mt-1 text-sm font-bold">{t}</h3><p className="text-xs leading-relaxed text-foreground/75">{d}</p>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* AI PLATFORM */}
      <section aria-labelledby="ai-soon" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="grid-cols-1 grid items-center gap-8 lg:grid-cols-[0.8fr_2fr]">
          <Reveal variant="left"><Badge tone="primary" className="rounded-full">New</Badge><h2 id="ai-soon" className="mt-3 text-3xl font-extrabold"><SplitText text="Next-Gen" /> <SplitText text="AI" rainbow delay={150} /> <SplitText text="for Your Bots" delay={300} /></h2>
            <p className="mt-2 text-sm text-foreground/75">Make your Telegram bots smarter with AI models, agents and your own knowledge.</p></Reveal>
          <ul className="grid-cols-1 grid gap-4 md:grid-cols-3">
            {([[Bot, "AI Agents", "Telegram agents with a model, instructions, memory and your knowledge, live in a few steps."], [Cpu, "AI Model Integration", "Browse models from NVIDIA, Google, Meta, Mistral and more, and try them in the Playground."], [Database, "Knowledge for Agents", "Add FAQs and policies as knowledge so answers stay accurate and on-topic."]] as const).map(([Icon, t, d], i) => (
              <Reveal as="li" key={t} delay={i * 110} variant="right">
                <div className="card lift h-full p-4"><IconTile size="md"><Icon /></IconTile><h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-xs leading-relaxed text-foreground/75">{d}</p></div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold"><SplitText text="Frequently asked" /> <SplitText text="questions" rainbow delay={150} /></h2>
        <div className="mt-8 space-y-3">
          {faqs.map(([q, a], i) => (
            <Reveal key={q} delay={i * 70}>
              <details className="card group p-4 transition hover:border-lavender/50 open:border-lavender/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden">{q}<ChevronDown className="size-4 shrink-0 transition-transform duration-300 group-open:rotate-180" aria-hidden /></summary>
                <p className="mt-2 text-sm text-foreground/75">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">
        <Reveal variant="zoom" className="animated-gradient relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl border border-lavender/50 bg-gradient-to-r from-[#3B1FB8] via-[#5B34F0] to-[#2B5BE8] p-8 shadow-[0_0_80px_-25px_rgb(var(--rn-primary))] sm:p-10">
          <div className="orb -right-10 -top-10 size-60 bg-white/30 float-slow" aria-hidden />
          <div className="relative flex items-center gap-5"><span className="grid-cols-1 float grid size-16 place-items-center rounded-2xl bg-white/15" aria-hidden><Send className="size-8 text-white" /></span>
            <div><h2 className="text-2xl font-extrabold text-white sm:text-3xl"><SplitText text="Your Telegram Automation Starts Here." /></h2><p className="mt-1 text-white/80">Build, automate and scale powerful Telegram bots, all in one platform.</p></div></div>
          <a href="/signup" className="sheen relative inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-[#3B1FB8] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">Create Your First Bot <ArrowRight className="size-4" aria-hidden /></a>
        </Reveal>
      </section>
    </>
  );
}
