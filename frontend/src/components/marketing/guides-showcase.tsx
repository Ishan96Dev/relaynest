"use client";

import { ArrowRight, BookOpen, Bot, Cpu, LayoutGrid, PlayCircle, Settings, Sparkles, Workflow } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import {
  FullscreenMediaModal, FullscreenTriggerButton, PRODUCT_VIDEO_MEDIA, type FullscreenMediaItem,
} from "@/components/ui/media-fullscreen-modal";

const JOURNEYS = [
  {
    title: "1. Account & Workspace Setup",
    desc: "Sign up, verify email, enjoy smooth full-screen greeting transitions, and inspect your Dashboard KPIs.",
    href: "/docs#auth-account",
    gif: "/images/docs/gifs/auth-account.gif",
    icon: Sparkles,
    time: "2 min guide",
  },
  {
    title: "2. Connect & Create a Bot",
    desc: "Create a bot token via @BotFather, validate it in RelayNest, auto-import its profile photo, and launch.",
    href: "/docs#create-bot",
    gif: "/images/docs/gifs/create-bot.gif",
    icon: Bot,
    time: "3 min guide",
  },
  {
    title: "3. Manage, Edit & Sync Bots",
    desc: "Update bot profile/commands/responses, run live Telegram sync, test replies, and audit Created & Deleted Bot History.",
    href: "/docs#manage-edit-bot",
    gif: "/images/docs/gifs/manage-bot.gif",
    icon: Settings,
    time: "4 min guide",
  },
  {
    title: "4. Clone Ready-Made Bot Templates",
    desc: "Preview Support, FAQ, Community, Notification, and Lead templates and deploy pre-built commands immediately.",
    href: "/docs#templates",
    gif: "/images/docs/gifs/templates.gif",
    icon: LayoutGrid,
    time: "2 min guide",
  },
  {
    title: "5. Build Visual Automations",
    desc: "Connect Trigger, Condition, Delay, Telegram Reply, and Webhook blocks visually and review Executions.",
    href: "/docs#automations-executions",
    gif: "/images/docs/gifs/automations.gif",
    icon: Workflow,
    time: "5 min guide",
  },
  {
    title: "6. Knowledge Base & AI Assistants",
    desc: "Upload PDFs or URLs into Knowledge Base, test prompts in Model Playground, and activate a 24/7 AI Agent.",
    href: "/docs#ai-agents-playground",
    gif: "/images/docs/gifs/ai-agents.gif",
    icon: Cpu,
    time: "5 min guide",
  },
  {
    title: "7. API Keys, Webhooks & In-App Swagger UI",
    desc: "Generate scoped API keys, test endpoints inside your authenticated In-App Swagger UI, connect Slack/Discord webhooks, and view Bell alerts.",
    href: "/docs#api-integrations",
    gif: "/images/docs/gifs/api-swagger.gif",
    icon: Workflow,
    time: "4 min guide",
  },
];

export function GuidesShowcase() {
  const [lightbox, setLightbox] = React.useState<{ items: FullscreenMediaItem[]; index: number } | null>(null);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  const mediaItems = React.useMemo<FullscreenMediaItem[]>(
    () => [
      ...JOURNEYS.map((j) => ({
        kind: "gif" as const,
        src: j.gif,
        alt: j.title,
        pageTitle: `${j.title} · Walkthrough`,
        caption: `${j.title} — ${j.desc}`,
      })),
      PRODUCT_VIDEO_MEDIA,
    ],
    [],
  );

  function openMedia(e: React.MouseEvent<HTMLButtonElement>, idx: number) {
    openerRef.current = e.currentTarget;
    setLightbox({ items: mediaItems, index: idx });
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-surface/85 p-6 shadow-[0_0_80px_-28px_rgb(var(--rn-primary))] sm:p-10">
        <Badge tone="primary" className="rounded-full px-3 py-1">
          <BookOpen className="size-3.5" aria-hidden /> Step-by-Step User Guides
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Learn RelayNest With Live Recorded Walkthroughs
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/80">
          Pick where you want to start. Open any guide GIF in full screen, or jump straight into detailed step-by-step screenshots.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/docs" size="md">Open Full Handbook <ArrowRight className="size-4" aria-hidden /></ButtonLink>
          <Button type="button" variant="outline" size="md" onClick={(e) => openMedia(e, JOURNEYS.length)}>
            <PlayCircle className="size-4" aria-hidden />Watch Product Video (Full Screen)
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {JOURNEYS.map((j, idx) => {
          const Icon = j.icon;
          return (
            <Card key={j.href} hover className="flex flex-col overflow-hidden p-5">
              <div className="group relative mb-4 overflow-hidden rounded-xl border border-border/80 bg-[#08081A]">
                <FullscreenTriggerButton
                  label={`Open ${j.title} GIF walkthrough in full screen`}
                  onClick={(e) => openMedia(e, idx)}
                  className="absolute right-2.5 top-2.5 z-10"
                />
                <Image src={j.gif} alt={j.title} width={960} height={600} unoptimized className="h-auto w-full" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <IconTile tone="primary" size="md"><Icon /></IconTile>
                <Badge tone="neutral">{j.time}</Badge>
              </div>
              <h2 className="mt-3 text-lg font-bold">{j.title}</h2>
              <p className="mt-1.5 flex-1 text-sm text-foreground/75">{j.desc}</p>
              <Link href={j.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-lavender hover:underline">
                Read guide &amp; screenshots <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Card>
          );
        })}
      </div>

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
