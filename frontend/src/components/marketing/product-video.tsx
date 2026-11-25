"use client";

import { Play, Pause, Volume2, VolumeX, Captions, Maximize2, Minimize2, X } from "lucide-react";
import * as React from "react";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Chapter = {
  id: string;
  label: string;
  timeSec: number;
  timeLabel: string;
};

const VIDEO_URL = "/video/relaynest-product-demo.mp4";
const DEFAULT_DURATION_SEC = 121.2;

const CHAPTERS: Chapter[] = [
  { id: "intro", label: "Meet RelayNest", timeSec: 0, timeLabel: "0:00" },
  { id: "dashboard", label: "Overview", timeSec: 9.7, timeLabel: "0:10" },
  { id: "telegram", label: "My Bots & Sync", timeSec: 20.17, timeLabel: "0:20" },
  { id: "manage-bot", label: "Manage Bot", timeSec: 32.1, timeLabel: "0:32" },
  { id: "templates", label: "Templates", timeSec: 43.77, timeLabel: "0:44" },
  { id: "workflow", label: "Automations", timeSec: 53.3, timeLabel: "0:53" },
  { id: "ai-studio", label: "AI & Playground", timeSec: 65.43, timeLabel: "1:05" },
  { id: "ai-agent", label: "Knowledge & Agents", timeSec: 75.83, timeLabel: "1:16" },
  { id: "analytics", label: "Analytics & Plans", timeSec: 87.07, timeLabel: "1:27" },
  { id: "integrations-api", label: "APIs & Swagger UI", timeSec: 98.9, timeLabel: "1:39" },
  { id: "closer", label: "Start Free", timeSec: 111.63, timeLabel: "1:52" },
];

function isSeekableAt(el: HTMLVideoElement, sec: number): boolean {
  if (sec <= 0.25) return true;
  for (let i = 0; i < el.seekable.length; i++) {
    if (sec >= el.seekable.start(i) - 0.25 && sec <= el.seekable.end(i) + 0.25) {
      return true;
    }
  }
  return false;
}

export function ProductVideoSection() {
  const playerFrameRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const sliderRef = React.useRef<HTMLDivElement>(null);

  const pendingSeekRef = React.useRef<number | null>(null);
  const autoPlayAfterSeekRef = React.useRef(false);
  const isScrubbingRef = React.useRef(false);
  const scrubTargetRef = React.useRef(0);
  const blobUrlRef = React.useRef<string | null>(null);
  const blobFetchRef = React.useRef<Promise<string | null> | null>(null);

  const [videoSrc, setVideoSrc] = React.useState(VIDEO_URL);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(DEFAULT_DURATION_SEC);
  const [ccEnabled, setCcEnabled] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [bufferingSeek, setBufferingSeek] = React.useState(false);

  React.useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === playerFrameRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const activeChapter = React.useMemo(() => {
    let current = CHAPTERS[0]!;
    for (const ch of CHAPTERS) {
      if (currentTime >= ch.timeSec - 0.15) current = ch;
    }
    return current;
  }, [currentTime]);

  function focusPlayerFrame() {
    playerFrameRef.current?.focus({ preventScroll: true });
  }

  /**
   * Fallback for proxies/CDNs that strip HTTP `Range` headers and serve a non-seekable `200 OK`
   * MP4 stream: buffers the video once into an in-memory `blob:` URL so seeking always works.
   */
  const ensureSeekableBlob = React.useCallback(async (targetSec: number, shouldPlay: boolean) => {
    pendingSeekRef.current = targetSec;
    autoPlayAfterSeekRef.current = shouldPlay;
    setCurrentTime(targetSec);

    if (blobUrlRef.current) {
      setVideoSrc(blobUrlRef.current);
      return;
    }

    setBufferingSeek(true);
    if (!blobFetchRef.current) {
      blobFetchRef.current = fetch(VIDEO_URL)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          return url;
        })
        .catch(() => null);
    }

    const url = await blobFetchRef.current;
    if (url) {
      setVideoSrc(url);
    } else {
      setBufferingSeek(false);
      blobFetchRef.current = null;
    }
  }, []);

  function applyResolvedSeek(el: HTMLVideoElement, targetSec: number, shouldPlay: boolean) {
    const effectiveDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration || DEFAULT_DURATION_SEC;
    const clamped = Math.max(0, Math.min(effectiveDur, targetSec));

    if (clamped > 1.5 && !isSeekableAt(el, clamped) && !blobUrlRef.current) {
      void ensureSeekableBlob(clamped, shouldPlay);
      return;
    }

    pendingSeekRef.current = clamped;
    autoPlayAfterSeekRef.current = shouldPlay;
    setCurrentTime(clamped);

    try {
      el.currentTime = clamped;
    } catch {
      // Ignore DOMException if browser still transitioning readyState; onLoadedMetadata/onCanPlay will retry.
    }

    // Detect synchronous snap-back to 0 when the upstream server ignored Range requests.
    if (clamped > 1.5 && el.currentTime < 0.5 && !el.seeking && !blobUrlRef.current) {
      void ensureSeekableBlob(clamped, shouldPlay);
      return;
    }

    if (shouldPlay && el.paused) {
      el.muted = muted;
      void el.play().catch(() => {});
    }
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.muted = muted;
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
    requestAnimationFrame(focusPlayerFrame);
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  function toggleCc() {
    const el = videoRef.current;
    if (!el || !el.textTracks[0]) return;
    const next = el.textTracks[0].mode !== "showing";
    el.textTracks[0].mode = next ? "showing" : "disabled";
    setCcEnabled(next);
  }

  function jumpTo(sec: number, autoPlay = true) {
    const el = videoRef.current;
    if (!el) return;
    const effectiveDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration || DEFAULT_DURATION_SEC;
    const clamped = Math.max(0, Math.min(effectiveDur, sec));

    pendingSeekRef.current = clamped;
    autoPlayAfterSeekRef.current = autoPlay;
    setCurrentTime(clamped);

    if (el.readyState < 1) {
      // Metadata has not loaded yet: trigger loading inside the user gesture and apply the seek on loadedmetadata.
      if (autoPlay) {
        el.muted = muted;
        void el.play().catch(() => {});
      } else {
        el.load();
      }
      return;
    }

    applyResolvedSeek(el, clamped, autoPlay);
  }

  function timeFromPointer(clientX: number): number {
    const track = sliderRef.current;
    const el = videoRef.current;
    if (!track) return currentTime;
    const rect = track.getBoundingClientRect();
    const pct = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    const effectiveDur = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration || DEFAULT_DURATION_SEC;
    return pct * effectiveDur;
  }

  function handleSliderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isScrubbingRef.current = true;
    const target = timeFromPointer(e.clientX);
    scrubTargetRef.current = target;
    setCurrentTime(target);
  }

  function handleSliderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbingRef.current) return;
    const target = timeFromPointer(e.clientX);
    scrubTargetRef.current = target;
    setCurrentTime(target);
  }

  function handleSliderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const target = timeFromPointer(e.clientX);
    scrubTargetRef.current = target;
    jumpTo(target, true);
  }

  function handleSliderPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    jumpTo(scrubTargetRef.current, playing);
  }

  function toggleFullscreen() {
    const frame = playerFrameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frame.requestFullscreen?.();
    }
  }

  const keyActionsRef = React.useRef({
    togglePlay: () => {},
    toggleMute: () => {},
    toggleCc: () => {},
    toggleFullscreen: () => {},
    seekBy: (_delta: number) => {},
  });

  keyActionsRef.current = {
    togglePlay,
    toggleMute,
    toggleCc,
    toggleFullscreen,
    seekBy: (delta: number) => {
      const el = videoRef.current;
      const base = pendingSeekRef.current ?? (el ? el.currentTime : currentTime);
      jumpTo(base + delta, false);
    },
  };

  React.useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      const target = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const checkEl = activeEl && activeEl !== document.body ? activeEl : target;
      const tag = checkEl?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || checkEl?.isContentEditable) return;

      const frame = playerFrameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight * 0.78 && rect.bottom > window.innerHeight * 0.22;
      const hasPlayerFocus = frame.contains(document.activeElement);
      const isActivePlayer = hasPlayerFocus || hovered || playing || isFullscreen || inViewport;
      if (!isActivePlayer) return;

      const isExternalInteractive = (tag === "button" || tag === "a") && !frame.contains(checkEl);
      if (isExternalInteractive) return;

      const key = e.key.toLowerCase();
      const isPlayerSubButton = tag === "button" && frame.contains(checkEl) && checkEl?.getAttribute("data-play-overlay") !== "true";

      if (key === "k" || (e.key === " " && !isPlayerSubButton)) {
        e.preventDefault();
        keyActionsRef.current.togglePlay();
      } else if (e.key === "ArrowLeft" && !isPlayerSubButton) {
        e.preventDefault();
        keyActionsRef.current.seekBy(-5);
      } else if (e.key === "ArrowRight" && !isPlayerSubButton) {
        e.preventDefault();
        keyActionsRef.current.seekBy(5);
      } else if (key === "m") {
        e.preventDefault();
        keyActionsRef.current.toggleMute();
      } else if (key === "c") {
        e.preventDefault();
        keyActionsRef.current.toggleCc();
      } else if (key === "f") {
        e.preventDefault();
        keyActionsRef.current.toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [hovered, playing, isFullscreen]);

  const fmt = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <section id="product-video" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 pt-20 sm:px-6 lg:pt-28">
      <div className="text-center">
        <Reveal>
          <Badge tone="primary" className="rounded-full px-3 py-1">
            Product Walkthrough
          </Badge>
        </Reveal>
        <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-extrabold leading-tight sm:text-[40px]">
          <SplitText text="See" /> <SplitText text="RelayNest" rainbow delay={150} />{" "}
          <SplitText text="in Action" delay={300} />
        </h2>
        <Reveal delay={180}>
          <p className="mx-auto mt-2 max-w-2xl text-foreground/75">
            Watch the full guided product tour covering every screen in RelayNest — from connecting your first Telegram bot and templates to automations, AI assistants, knowledge docs, and analytics, complete with voiceover and synced subtitles.
          </p>
        </Reveal>
      </div>

      <Reveal variant="zoom" delay={140} className="mt-10">
        <div
          ref={playerFrameRef}
          role="region"
          tabIndex={0}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="RelayNest product tour video player. Use Space or K to play or pause, Left and Right arrows to seek, M to mute, C for captions, and F for full screen."
          className={cn(
            "card-glow overflow-hidden bg-[#08081A] p-2 sm:p-3 shadow-[0_0_95px_-28px_rgb(var(--rn-primary))] focus:outline-none",
            isFullscreen && "flex h-screen flex-col justify-between p-4 sm:p-6",
          )}
        >
          {isFullscreen && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-lavender">RelayNest Product Walkthrough · {activeChapter.label}</span>
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Close fullscreen video"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/20 px-3 text-xs font-bold text-white transition hover:bg-danger"
              >
                <X className="size-4" aria-hidden />
                <span>Close Full Screen</span>
              </button>
            </div>
          )}

          <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-[#08081A]", isFullscreen && "min-h-0 flex-1")}>
            <video
              ref={videoRef}
              src={videoSrc}
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              poster="/video/relaynest-product-demo-poster.png"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                pendingSeekRef.current = null;
                setPlaying(false);
              }}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (el.duration && Number.isFinite(el.duration)) {
                  setDuration(el.duration);
                }
                if (el.textTracks[0]) {
                  el.textTracks[0].mode = ccEnabled ? "showing" : "disabled";
                }
                const pending = pendingSeekRef.current;
                if (pending !== null) {
                  applyResolvedSeek(el, pending, autoPlayAfterSeekRef.current);
                }
              }}
              onSeeked={(e) => {
                const el = e.currentTarget;
                const pending = pendingSeekRef.current;
                if (pending !== null) {
                  if (pending > 1.5 && el.currentTime < 0.5 && !blobUrlRef.current) {
                    void ensureSeekableBlob(pending, !el.paused || autoPlayAfterSeekRef.current);
                    return;
                  }
                  if (Math.abs(el.currentTime - pending) <= 1.5) {
                    pendingSeekRef.current = null;
                  }
                }
                setBufferingSeek(false);
                if (!isScrubbingRef.current) {
                  setCurrentTime(el.currentTime);
                }
                if (autoPlayAfterSeekRef.current && el.paused) {
                  autoPlayAfterSeekRef.current = false;
                  el.muted = muted;
                  void el.play().catch(() => {});
                }
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (isScrubbingRef.current) return;
                const pending = pendingSeekRef.current;
                if (pending !== null) {
                  if (el.seeking) return;
                  if (Math.abs(el.currentTime - pending) <= 1.5) {
                    pendingSeekRef.current = null;
                    setBufferingSeek(false);
                    setCurrentTime(el.currentTime);
                    return;
                  }
                  if (pending > 1.5 && el.currentTime < 0.5 && el.readyState >= 2 && !blobUrlRef.current) {
                    void ensureSeekableBlob(pending, !el.paused || autoPlayAfterSeekRef.current);
                    return;
                  }
                  if (isSeekableAt(el, pending)) {
                    try {
                      el.currentTime = pending;
                    } catch {
                      // retry on next event
                    }
                  }
                  return;
                }
                setCurrentTime(el.currentTime);
              }}
              onClick={togglePlay}
            >
              <track
                kind="subtitles"
                src="/video/relaynest-product-demo.vtt"
                srcLang="en"
                label="English"
              />
            </video>

            {bufferingSeek && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-lavender/40 bg-[#08081A]/85 px-3 py-1 text-xs font-semibold text-lavender backdrop-blur-sm">
                Seeking to {fmt(currentTime)}…
              </div>
            )}

            {/* Play Overlay when paused */}
            {!playing && !bufferingSeek && (
              <button
                type="button"
                data-play-overlay="true"
                onClick={togglePlay}
                aria-label="Play RelayNest product demo video with sound and subtitles"
                className="group absolute inset-0 grid place-items-center bg-[#08081A]/35 backdrop-blur-[1px] transition hover:bg-[#08081A]/20"
              >
                <span className="flex items-center gap-3 rounded-full border border-lavender/50 bg-surface/90 px-6 py-4 text-base font-bold text-white shadow-[0_0_50px_-8px_rgb(var(--rn-primary))] transition duration-300 group-hover:scale-105">
                  <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white">
                    <Play className="ml-0.5 size-5 fill-current" aria-hidden />
                  </span>
                  <span>Watch Product Tour</span>
                </span>
              </button>
            )}
          </div>

          {/* Interactive Controls & Chapter Strip */}
          <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-surface-2/85 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause video (Space or K)" : "Play video (Space or K)"}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/20 px-3 text-xs font-bold text-lavender transition hover:bg-primary/30"
              >
                {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                <span>{playing ? "Pause" : "Play"}</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute audio (M)" : "Mute audio (M)"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 bg-surface/70 px-3 text-xs font-semibold text-foreground/85 transition hover:border-lavender/60"
              >
                {muted ? <VolumeX className="size-4 text-warn" aria-hidden /> : <Volume2 className="size-4 text-accent" aria-hidden />}
                <span className="hidden sm:inline">{muted ? "Muted" : "Sound On"}</span>
              </button>

              <button
                type="button"
                onClick={toggleCc}
                aria-pressed={ccEnabled}
                title="Toggle native closed-caption track (C)"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition",
                  ccEnabled
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-border/80 bg-surface/70 text-foreground/85 hover:border-lavender/60",
                )}
              >
                <Captions className="size-4" aria-hidden />
                <span className="hidden sm:inline">CC Track</span>
              </button>

              {/* Progress scrubber with click, drag, and arrow seek */}
              <div className="flex min-w-[140px] flex-1 items-center gap-2.5">
                <span className="font-mono text-xs text-muted">{fmt(currentTime)}</span>
                <div
                  ref={sliderRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Video playback progress"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(currentTime)}
                  aria-valuetext={`${fmt(currentTime)} of ${fmt(duration)}`}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); jumpTo(currentTime - 5, false); }
                    else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); jumpTo(currentTime + 5, false); }
                    else if (e.key === "Home") { e.preventDefault(); jumpTo(0, false); }
                    else if (e.key === "End") { e.preventDefault(); jumpTo(duration, false); }
                  }}
                  onPointerDown={handleSliderPointerDown}
                  onPointerMove={handleSliderPointerMove}
                  onPointerUp={handleSliderPointerUp}
                  onPointerCancel={handleSliderPointerCancel}
                  className="group relative flex h-6 flex-1 cursor-pointer touch-none items-center select-none"
                >
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-lavender to-accent"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lavender bg-white shadow-[0_0_12px_rgba(167,139,250,0.8)] transition-transform group-hover:scale-110"
                    style={{ left: `${progressPct}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-muted">{fmt(duration)}</span>
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit Fullscreen (F)" : "Enter Fullscreen (F)"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 bg-surface/70 px-2.5 text-xs font-semibold text-foreground/85 transition hover:border-lavender/60 hover:text-foreground"
              >
                {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
                <span className="hidden md:inline">{isFullscreen ? "Exit Full" : "Full Screen"}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div
                role="group"
                aria-label="Video chapters"
                onKeyDown={(e) => {
                  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
                  const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  if (idx < 0) return;
                  if (e.key === "ArrowRight") { e.preventDefault(); buttons[(idx + 1) % buttons.length]?.focus(); }
                  else if (e.key === "ArrowLeft") { e.preventDefault(); buttons[(idx - 1 + buttons.length) % buttons.length]?.focus(); }
                  else if (e.key === "Home") { e.preventDefault(); buttons[0]?.focus(); }
                  else if (e.key === "End") { e.preventDefault(); buttons[buttons.length - 1]?.focus(); }
                }}
                className="flex flex-wrap gap-1.5"
              >
                {CHAPTERS.map((ch, idx) => {
                  const isActive = ch.id === activeChapter.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => jumpTo(ch.timeSec)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                        isActive
                          ? "border-lavender/60 bg-primary/20 text-foreground"
                          : "border-border/50 bg-surface/50 text-muted hover:border-border hover:text-foreground",
                      )}
                    >
                      <span className="font-mono text-[11px] text-lavender">{idx + 1}.</span>
                      <span>{ch.label}</span>
                      <span className="font-mono text-[10px] opacity-75">{ch.timeLabel}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hidden font-mono text-[10px] text-muted xl:block">
                Space/K: Play/Pause · ←/→: ±5s · M: Mute · F: Fullscreen
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
