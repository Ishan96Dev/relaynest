"use client";

import {
  AlertOctagon, AlertTriangle, ArrowRight, BarChart3, Bell, BookOpen, Bot, CheckCircle2,
  Code2, Cpu, CreditCard, Film, History, Home, Info, KeyRound, LayoutGrid, Lock, Pencil, PlayCircle,
  Puzzle, Search, ShieldCheck, SlidersHorizontal, Sparkles, User, Workflow, type LucideIcon,
} from "lucide-react";
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
import { centerElementInContainer, useScrollSpy } from "@/components/ui/use-scroll-spy";
import { DOC_RELEASES, GROUPS, type CalloutTone, type PageGuide } from "@/data/docs-versions";
import { cn } from "@/lib/utils";

const ICONS: Record<PageGuide["iconKey"], LucideIcon> = {
  user: User,
  home: Home,
  bot: Bot,
  pencil: Pencil,
  sparkles: Sparkles,
  layout: LayoutGrid,
  workflow: Workflow,
  book: BookOpen,
  cpu: Cpu,
  brain: Sparkles,
  chart: BarChart3,
  puzzle: Puzzle,
  credit: CreditCard,
  key: KeyRound,
  code: Code2,
  shield: ShieldCheck,
};

const CALLOUT_META: Record<CalloutTone, { icon: LucideIcon; badgeTone: "info" | "warning" | "danger" | "success" }> = {
  info: { icon: Info, badgeTone: "info" },
  warning: { icon: AlertTriangle, badgeTone: "warning" },
  danger: { icon: AlertOctagon, badgeTone: "danger" },
  success: { icon: CheckCircle2, badgeTone: "success" },
};

export function DocsHub() {
  const [selectedVer, setSelectedVer] = React.useState(DOC_RELEASES[0]!.version);
  const [query, setQuery] = React.useState("");
  const [lightbox, setLightbox] = React.useState<{ items: FullscreenMediaItem[]; index: number } | null>(null);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);
  const tocContainerRef = React.useRef<HTMLDivElement>(null);
  const tocRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});

  const activeRelease = React.useMemo(
    () => DOC_RELEASES.find((r) => r.version === selectedVer) ?? DOC_RELEASES[0]!,
    [selectedVer],
  );

  const guides = activeRelease.guides;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.purpose.toLowerCase().includes(q) ||
        g.route.toLowerCase().includes(q) ||
        g.steps.some((st) => st.title.toLowerCase().includes(q) || st.detail.toLowerCase().includes(q)) ||
        (g.callouts ?? []).some((c) => c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)),
    );
  }, [guides, query]);

  const filteredIds = React.useMemo(() => filtered.map((g) => g.id), [filtered]);
  const [activeId, setActiveId] = useScrollSpy(filteredIds, { initialId: "auth-account", topOffset: 260 });

  const activeGuide = React.useMemo(
    () => filtered.find((g) => g.id === activeId) ?? filtered[0] ?? guides[0],
    [filtered, guides, activeId],
  );

  // Sync dynamic document title & keep active sidebar item centered inside the sticky sidebar container without moving window scroll
  React.useEffect(() => {
    if (!activeGuide) return;
    document.title = `${activeGuide.title} · Docs v${activeRelease.version} | RelayNest`;
    centerElementInContainer(tocContainerRef.current, tocRefs.current[activeGuide.id] ?? null);
  }, [activeGuide, activeRelease.version]);

  function openFullscreen(e: React.MouseEvent<HTMLButtonElement>, items: FullscreenMediaItem[], index = 0) {
    openerRef.current = e.currentTarget;
    setLightbox({ items, index });
  }

  function closeFullscreen() {
    setLightbox(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="sr-only" role="status" aria-live="polite">
        Documentation version {activeRelease.label}. Currently viewing {activeGuide?.title ?? "overview"}. {filtered.length} sections available.
      </div>

      {/* Top Banner + Dynamic Version Switcher */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-surface/85 p-6 shadow-[0_0_80px_-28px_rgb(var(--rn-primary))] sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="primary" className="rounded-full px-3 py-1">
                <BookOpen className="size-3.5" aria-hidden /> Complete User Documentation
              </Badge>
              <label htmlFor="docs-version-select" className="sr-only">Select documentation version</label>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-lavender/40 bg-surface-2/90 px-3 py-1 text-xs">
                <History className="size-3.5 text-lavender" aria-hidden />
                <select
                  id="docs-version-select"
                  value={selectedVer}
                  onChange={(e) => {
                    setSelectedVer(e.target.value);
                    setActiveId("auth-account");
                  }}
                  aria-label="Documentation release version"
                  className="bg-transparent font-bold text-foreground focus:outline-none"
                >
                  {DOC_RELEASES.map((rel) => (
                    <option key={rel.version} value={rel.version} className="bg-surface text-foreground">
                      {rel.label} · {rel.releasedAt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Every RelayNest Page, Explained With Live Guides
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/80">
              {activeRelease.summary}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeRelease.highlights.map((h) => (
                <span key={h} className="rounded-md border border-border/80 bg-surface-2/70 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                  {h}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="button" variant="subtle" size="md" onClick={(e) => openFullscreen(e, [PRODUCT_VIDEO_MEDIA], 0)}>
                <PlayCircle className="size-4" aria-hidden /> Watch Product Video (Full Screen)
              </Button>
              <ButtonLink href="/features" variant="outline" size="md">
                Explore Features
              </ButtonLink>
              <ButtonLink href="/signup" size="md">
                Start Free <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>

          {/* Hero Live GIF Card with Fullscreen Button */}
          <div className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-surface-2 p-1.5">
            <FullscreenTriggerButton
              label="View hero walkthrough GIF and video in full screen"
              onClick={(e) => {
                const g = activeGuide ?? guides[0]!;
                openFullscreen(
                  e,
                  [
                    { ...g.gif, pageTitle: `${g.title} · Live Walkthrough (${g.route})` },
                    PRODUCT_VIDEO_MEDIA,
                  ],
                  0,
                );
              }}
              className="absolute right-3.5 top-3.5 z-10"
            />
            <Image
              src="/images/docs/gifs/my-bots.gif"
              alt="RelayNest My Bots and Bot Lifecycle History live GIF walkthrough"
              width={960}
              height={600}
              unoptimized
              priority
              className="h-auto w-full rounded-xl"
            />
          </div>
        </div>

        {!activeRelease.isCurrent && (
          <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
            <span>
              You are reading an archived snapshot for <strong>{activeRelease.label}</strong> ({activeRelease.releasedAt}). Historical docs remain preserved as originally released.
            </span>
            <Button type="button" size="sm" onClick={() => setSelectedVer(DOC_RELEASES[0]!.version)}>
              Switch to {DOC_RELEASES[0]!.label}
            </Button>
          </div>
        )}

        <div className="relative mt-7 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any page, sync alert, or feature (e.g. Manage Bot, Telegram Sync, History, Templates)..."
            aria-label="Search documentation sections"
            className="h-11 w-full rounded-xl border border-border bg-surface-2/90 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-lavender focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* Sticky Scroll-Synced Sidebar Table of Contents */}
        <aside aria-label="Documentation table of contents" className="lg:sticky lg:top-24 lg:self-start">
          <Card ref={tocContainerRef} className="max-h-[calc(100vh-7rem)] overflow-y-auto p-3.5">
            <div className="mb-2 flex items-center justify-between border-b border-border/60 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-lavender">
              <span>Docs {activeRelease.label.split(" ")[0]}</span>
              <span className="text-muted">{filtered.length} guides</span>
            </div>
            {GROUPS.map((grp) => {
              const items = guides.filter((g) => g.group === grp);
              if (items.length === 0) return null;
              return (
                <div key={grp} className="mb-3 last:mb-0">
                  <p className="px-3 pb-1.5 pt-2.5 text-xs font-bold uppercase tracking-[0.08em] text-lavender">{grp}</p>
                  <nav aria-label={grp} className="space-y-0.5">
                    {items.map((s) => {
                      const Icon = ICONS[s.iconKey];
                      const active = activeId === s.id;
                      return (
                        <a
                          key={s.id}
                          ref={(node) => { tocRefs.current[s.id] = node; }}
                          href={`#${s.id}`}
                          aria-current={active ? "true" : undefined}
                          onClick={() => setActiveId(s.id)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl border-l-2 px-3 py-2 text-[13px] font-medium transition",
                            active
                              ? "border-lavender bg-primary/20 font-semibold text-lavender"
                              : "border-transparent text-foreground/75 hover:bg-primary/10 hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{s.title}</span>
                        </a>
                      );
                    })}
                  </nav>
                </div>
              );
            })}

            <div className="mt-4 rounded-xl border border-border/60 bg-surface-2/70 p-3.5 text-xs text-muted">
              <p className="font-semibold text-foreground">Need hands-on support?</p>
              <p className="mt-1">Reach our team via Contact or share Feedback anytime.</p>
              <Link href="/contact" className="mt-2 inline-flex items-center gap-1 font-semibold text-lavender hover:underline">
                Contact Support <ArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
          </Card>
        </aside>

        {/* Page Guides */}
        <div className="space-y-10">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-base font-bold">No guides match &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-sm text-muted">Try searching for Overview, My Bots, Manage Bot, Sync, Templates, Workflows, Knowledge Base, Billing, or Notifications.</p>
            </Card>
          ) : (
            filtered.map((guide) => {
              const Icon = ICONS[guide.iconKey];
              const sectionMedia: FullscreenMediaItem[] = [
                { ...guide.gif, pageTitle: `${guide.title} · Walkthrough (${guide.route})` },
                ...guide.screenshots.map((shot) => ({
                  ...shot,
                  pageTitle: `${guide.title} · ${(shot.caption ?? "").split(":")[0] || guide.route}`,
                })),
                PRODUCT_VIDEO_MEDIA,
              ];
              return (
                <section
                  key={guide.id}
                  id={guide.id}
                  aria-labelledby={`${guide.id}-heading`}
                  className="card scroll-mt-24 overflow-hidden p-6 sm:p-8"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary" className="rounded-full px-3 py-1">
                          {guide.badge}
                        </Badge>
                        <span className="rounded-md border border-border/80 bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
                          {guide.route}
                        </span>
                        <span className="rounded-md border border-border/70 bg-surface/60 px-2 py-0.5 font-mono text-[11px] text-lavender">
                          v{activeRelease.version}
                        </span>
                      </div>
                      <h2 id={`${guide.id}-heading`} className="mt-3 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
                        <Icon className="size-6 shrink-0 text-lavender" aria-hidden />
                        <span>{guide.title}</span>
                      </h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80 sm:text-base">{guide.purpose}</p>
                    </div>
                  </div>

                  {/* Highlighted & Animated Important Info / Critical Warnings */}
                  {guide.callouts && guide.callouts.length > 0 && (
                    <div className="mt-5 grid gap-3.5">
                      {guide.callouts.map((c) => {
                        const meta = CALLOUT_META[c.tone];
                        const CIcon = meta.icon;
                        return (
                          <div key={c.title} className="rn-callout p-4 sm:p-5" data-tone={c.tone}>
                            <div className="relative z-10 flex items-start gap-3.5">
                              <IconTile tone={c.tone === "success" ? "success" : c.tone === "warning" ? "warning" : c.tone === "danger" ? "danger" : "info"} size="md">
                                <CIcon className={c.tone === "danger" || c.tone === "warning" ? "animate-pulse" : undefined} aria-hidden />
                              </IconTile>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={meta.badgeTone} dot>{c.badge}</Badge>
                                  <h3 className="text-sm font-extrabold text-foreground sm:text-base">{c.title}</h3>
                                </div>
                                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{c.body}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Recorded Interactive GIF Walkthrough with Fullscreen Button */}
                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-primary/45 bg-[#08081A] p-2.5 shadow-[0_0_40px_-18px_rgb(var(--rn-primary))]">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-0.5 text-xs">
                      <span className="inline-flex items-center gap-2 font-bold text-lavender">
                        <Film className="size-3.5" aria-hidden />
                        Interactive Screen Walkthrough
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                          <span className="size-1.5 animate-ping rounded-full bg-emerald-400" aria-hidden />
                          Recorded GIF Guide
                        </span>
                        <FullscreenTriggerButton
                          label={`Open ${guide.title} GIF walkthrough in full screen`}
                          onClick={(e) => openFullscreen(e, sectionMedia, 0)}
                          className="bg-primary/20 py-1"
                        />
                      </div>
                    </div>
                    <Image
                      src={guide.gif.src}
                      alt={guide.gif.alt}
                      width={960}
                      height={600}
                      unoptimized
                      className="h-auto w-full rounded-xl"
                    />
                    <p className="px-2 pb-1 pt-2.5 text-xs leading-relaxed text-muted">{guide.gif.caption}</p>
                  </div>

                  {/* Screenshots gallery with per-image Fullscreen Buttons */}
                  {guide.screenshots.length > 0 && (
                    <div
                      className={cn(
                        "mt-5 grid gap-5",
                        guide.screenshots.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
                      )}
                    >
                      {guide.screenshots.map((shot, sIdx) => (
                        <figure
                          key={shot.src}
                          className="group relative overflow-hidden rounded-2xl border border-border/80 bg-[#08081A] p-2 shadow-lg"
                        >
                          <FullscreenTriggerButton
                            label={`View full screen: ${shot.alt}`}
                            onClick={(e) => openFullscreen(e, sectionMedia, sIdx + 1)}
                            className="absolute right-4 top-4 z-10 py-1"
                          />
                          <Image
                            src={shot.src}
                            alt={shot.alt}
                            width={1440}
                            height={900}
                            className="h-auto w-full rounded-xl"
                          />
                          <figcaption className="px-2 pb-1 pt-2.5 text-xs leading-relaxed text-muted">
                            {shot.caption}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  {/* Step-by-step instructions */}
                  <ol className="mt-6 space-y-4">
                    {guide.steps.map((st, idx) => (
                      <li
                        key={st.title}
                        className="rounded-2xl border border-border/70 bg-surface-2/75 p-4 sm:p-5"
                      >
                        <div className="flex items-start gap-3.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-extrabold text-lavender ring-1 ring-primary/40">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-foreground">{st.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-foreground/80">{st.detail}</p>
                            {st.tip && (
                              <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                <span>{st.tip}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {guide.id === "settings-billing" && (
                    <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
                      {[
                        [Bell, "Notification Controls", "Toggle email vs app bell alerts individually in Settings -> Notifications."],
                        [Lock, "Account Protection", "Update password and sign out other devices inside Security & Access."],
                        [SlidersHorizontal, "Theme & Motion", "Switch Dark/Light look, High Contrast, or Reduced Motion in Preferences."],
                      ].map(([I, title, desc]) => {
                        const ItemIcon = I as LucideIcon;
                        return (
                          <div key={title as string} className="rounded-xl border border-border/70 bg-surface-2/60 p-3.5">
                            <ItemIcon className="size-4 text-lavender" aria-hidden />
                            <p className="mt-2 font-bold">{title as string}</p>
                            <p className="mt-1 text-muted">{desc as string}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>

      {lightbox && (
        <FullscreenMediaModal
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(idx) => setLightbox((prev) => (prev ? { ...prev, index: idx } : null))}
          onClose={closeFullscreen}
        />
      )}
    </div>
  );
}
