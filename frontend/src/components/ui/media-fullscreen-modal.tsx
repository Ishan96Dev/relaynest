"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FullscreenMediaItem {
  kind: "image" | "gif" | "video";
  src: string;
  alt: string;
  /** Real page/section label displayed cleanly in top-left viewer header instead of generic "Screenshot"/"GIF". */
  pageTitle?: string;
  caption?: string;
  poster?: string;
}

export const PRODUCT_VIDEO_MEDIA: FullscreenMediaItem = {
  kind: "video",
  src: "/video/relaynest-product-demo.mp4",
  poster: "/video/relaynest-product-demo-poster.png",
  pageTitle: "RelayNest Product Tour Video",
  alt: "RelayNest full product tour video with voiceover and synchronized captions",
  caption: "Full RelayNest Product Walkthrough Video — Voiceover, Sound Design & Synchronized Captions.",
};

export function FullscreenTriggerButton({
  onClick,
  label,
  className,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-lavender/45 bg-[#08081A]/90 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-md backdrop-blur-sm transition hover:border-lavender hover:bg-primary",
        className,
      )}
    >
      <Maximize2 className="size-3.5" aria-hidden />
      <span>Full Screen</span>
    </button>
  );
}

export function FullscreenMediaModal({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: FullscreenMediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const [nativeFs, setNativeFs] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);
  const [muted, setMuted] = React.useState(false);
  const current = items[index];

  const closeCleanly = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onClose();
  }, [onClose]);

  const toggleVideoPlay = React.useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const toggleBrowserFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Ignore if browser blocks native fullscreen
    }
  }, []);

  React.useEffect(() => {
    closeBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFs = () => setNativeFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCleanly();
        return;
      }
      if (e.key === "Tab" && containerRef.current) {
        const focusables = [...containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], video[controls], [tabindex]:not([tabindex="-1"])',
        )].filter((el) => el.offsetParent !== null);
        if (focusables.length > 0) {
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (e.key === "ArrowRight" && items.length > 1) {
        e.preventDefault();
        onIndexChange((index + 1) % items.length);
      } else if (e.key === "ArrowLeft" && items.length > 1) {
        e.preventDefault();
        onIndexChange((index - 1 + items.length) % items.length);
      } else if ((e.key === " " || e.key.toLowerCase() === "k") && current?.kind === "video") {
        // Space/K plays or pauses video cleanly when focus is inside the modal (unless focused directly on a button other than video frame)
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag !== "button" || e.key.toLowerCase() === "k") {
          e.preventDefault();
          toggleVideoPlay();
        }
      } else if (e.key.toLowerCase() === "m" && current?.kind === "video" && videoRef.current) {
        e.preventDefault();
        videoRef.current.muted = !videoRef.current.muted;
        setMuted(videoRef.current.muted);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleBrowserFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeCleanly, current?.kind, index, items.length, onIndexChange, toggleBrowserFullscreen, toggleVideoPlay]);

  if (!current || typeof document === "undefined") return null;

  const displayLabel = current.pageTitle?.trim() || current.alt;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Fullscreen viewer: ${displayLabel}`}
      style={{ zIndex: 2147483000, backgroundColor: "#050512" }}
      className="fixed inset-0 flex flex-col p-4 sm:p-6"
    >
      {/* Top Bar — always pinned above site headers */}
      <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-2.5 text-xs">
          <Badge tone={current.kind === "video" ? "info" : current.kind === "gif" ? "success" : "primary"} className="max-w-[55vw] truncate sm:max-w-md">
            {displayLabel}
          </Badge>
          {items.length > 1 && (
            <span className="shrink-0 font-mono font-semibold text-foreground/85">
              {index + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {current.kind === "video" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleVideoPlay}
                aria-label={playing ? "Pause video (K)" : "Play video (K)"}
              >
                {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!videoRef.current) return;
                  videoRef.current.muted = !videoRef.current.muted;
                  setMuted(videoRef.current.muted);
                }}
                aria-label={muted ? "Unmute video (M)" : "Mute video (M)"}
              >
                {muted ? <VolumeX className="size-4 text-warn" aria-hidden /> : <Volume2 className="size-4 text-accent" aria-hidden />}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleBrowserFullscreen}
            aria-label={nativeFs ? "Exit browser fullscreen (F)" : "Enter browser fullscreen (F)"}
          >
            {nativeFs ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{nativeFs ? "Exit Full Screen" : "Browser Full Screen"}</span>
          </Button>
          <Button
            ref={closeBtnRef}
            type="button"
            variant="danger"
            size="sm"
            onClick={closeCleanly}
            aria-label="Close fullscreen preview (Esc)"
          >
            <X className="size-4" aria-hidden />
            <span>Close</span>
          </Button>
        </div>
      </div>

      {/* Main Viewport Stage */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center overflow-hidden rounded-2xl border border-primary/50 bg-[#08081A] p-3 shadow-2xl">
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
            aria-label="Previous item (Left Arrow)"
            className="absolute left-3 z-10 grid size-10 place-items-center rounded-full border border-lavender/40 bg-[#0B0A22]/90 text-white shadow-lg transition hover:border-lavender hover:bg-primary"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        )}

        {current.kind === "video" ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            poster={current.poster}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="max-h-full max-w-full rounded-xl"
          >
            <source src={current.src} type="video/mp4" />
            <track kind="subtitles" src="/video/relaynest-product-demo.vtt" srcLang="en" label="English" default />
          </video>
        ) : (
          <Image
            src={current.src}
            alt={current.alt}
            width={1440}
            height={900}
            unoptimized={current.kind === "gif"}
            className="max-h-full w-auto max-w-full rounded-xl object-contain"
          />
        )}

        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % items.length)}
            aria-label="Next item (Right Arrow)"
            className="absolute right-3 z-10 grid size-10 place-items-center rounded-full border border-lavender/40 bg-[#0B0A22]/90 text-white shadow-lg transition hover:border-lavender hover:bg-primary"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {/* Caption & Discoverable Keyboard Shortcuts */}
      <div className="mx-auto mt-3 flex w-full max-w-5xl shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-foreground/80">
        <p className="min-w-0 flex-1 truncate sm:whitespace-normal">{current.caption ?? current.alt}</p>
        <p className="shrink-0 font-mono text-[11px] text-lavender/90">
          Tab: Focus · {items.length > 1 ? "←/→: Switch · " : ""}{current.kind === "video" ? "Space/K: Play/Pause · M: Mute · " : ""}F: Browser Full · Esc: Close
        </p>
      </div>
    </div>,
    document.body,
  );
}
