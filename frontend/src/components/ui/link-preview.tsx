"use client";
/* Remote OpenGraph preview images and site favicons come from dynamic open-web origins. */
/* eslint-disable @next/next/no-img-element */
import { ArrowUpRight, ExternalLink, Globe, Link2 } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  extractYoutubeThumbnail,
  getFaviconUrl,
  isSafeHttpUrl,
  safeDisplayDomain,
  safeDisplayPath,
  type LinkPreviewData,
} from "@backend/server/ai/link-preview-types";
import { cn } from "@/lib/utils";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;
const CARD_WIDTH = 316;
const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 10;
const TOP_HEADROOM_MIN = 250;

const previewCache = new Map<string, LinkPreviewData>();
const inflightRequests = new Map<string, Promise<LinkPreviewData | null>>();

function buildClientFallback(
  url: string,
  seed?: { title?: string; description?: string; siteName?: string; image?: string },
): LinkPreviewData {
  const domain = safeDisplayDomain(url);
  const ytThumb = extractYoutubeThumbnail(url);
  const favicon = getFaviconUrl(domain);
  return {
    url,
    domain,
    title: seed?.title?.trim() || domain,
    ...(seed?.description?.trim() ? { description: seed.description.trim() } : {}),
    ...(seed?.image || ytThumb ? { image: seed?.image || ytThumb } : {}),
    siteName: seed?.siteName?.trim() || domain,
    ...(favicon ? { favicon } : {}),
  };
}

/** Fetches and caches OpenGraph link metadata via RelayNest's SSRF-safe `/api/v1/ai/link-preview` endpoint. */
export function fetchLinkPreviewClient(url: string): Promise<LinkPreviewData | null> {
  if (!/^https:\/\//i.test(url)) return Promise.resolve(null);
  const cached = previewCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflightRequests.get(url);
  if (existing) return existing;

  const req = fetch(`/api/v1/ai/link-preview?url=${encodeURIComponent(url)}`, {
    method: "GET",
    headers: { accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { data?: LinkPreviewData } | null;
      const data = json?.data;
      if (!data) return null;
      previewCache.set(url, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflightRequests.delete(url);
    });

  inflightRequests.set(url, req);
  return req;
}

export function SiteFavicon({
  url,
  favicon,
  className,
}: {
  url: string;
  favicon?: string;
  className?: string;
}) {
  const src = favicon || getFaviconUrl(url);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <Globe className={cn("size-3.5 shrink-0 text-lavender/80", className)} aria-hidden />;
  }

  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("size-3.5 shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}

interface PlacedCard {
  side: "top" | "bottom";
  left: number;
  anchorY: number;
  arrowLeft: number;
}

function computePlacement(rect: DOMRect): PlacedCard {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - VIEWPORT_MARGIN * 2);
  const side: "top" | "bottom" =
    rect.top >= TOP_HEADROOM_MIN || rect.top > vh - rect.bottom ? "top" : "bottom";
  const centerX = rect.left + rect.width / 2;
  const left = Math.min(Math.max(VIEWPORT_MARGIN, centerX - width / 2), vw - width - VIEWPORT_MARGIN);
  const arrowLeft = Math.min(Math.max(18, centerX - left), width - 18);
  const anchorY = side === "top" ? vh - rect.top + TRIGGER_GAP : rect.bottom + TRIGGER_GAP;
  return { side, left, anchorY, arrowLeft };
}

export interface LinkPreviewProps {
  url: string;
  children: React.ReactNode;
  className?: string;
  /** Pre-seeded metadata (e.g. from citation sources) for instant zero-flicker preview before OG enrichment completes. */
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  badge?: string;
  /** When "span", wraps a custom interactive child (such as a citation button) instead of rendering an <a>. */
  as?: "a" | "span";
  /** Suppress hover popover when desired (for example, while layout is actively resizing). */
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Interactive portal-rendered Link Preview hover card (inspired by Aceternity UI Link Preview & Perplexity citations).
 * Renders via `createPortal` so it is never clipped by scrollable chat containers, anchors upward/downward cleanly
 * without height-jump flicker, tracks subtle pointer parallax without React re-renders, and lazily enriches with
 * live OpenGraph metadata + thumbnails.
 */
export const LinkPreview = React.memo(function LinkPreview({
  url,
  children,
  className,
  title: seedTitle,
  description: seedDescription,
  siteName: seedSiteName,
  image: seedImage,
  badge,
  as = "a",
  disabled = false,
  onClick,
}: LinkPreviewProps) {
  const safe = isSafeHttpUrl(url);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  const [open, setOpen] = React.useState(false);
  const [placed, setPlaced] = React.useState<PlacedCard | null>(null);
  const [fetched, setFetched] = React.useState<LinkPreviewData | null>(() =>
    safe ? (previewCache.get(url) ?? null) : null,
  );
  const [loading, setLoading] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setFetched(safe ? (previewCache.get(url) ?? null) : null);
    setLoading(false);
  }, [safe, url]);

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => {
      clearTimers();
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, clearTimers]);

  // Lazily fetch OpenGraph metadata the first time the preview card is opened.
  React.useEffect(() => {
    if (!open || !safe || !/^https:\/\//i.test(url)) return;
    const cached = previewCache.get(url);
    if (cached) {
      setFetched(cached);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchLinkPreviewClient(url).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res) setFetched(res);
    });
    return () => {
      alive = false;
    };
  }, [open, safe, url]);

  const fallback = React.useMemo(
    () =>
      safe
        ? buildClientFallback(url, {
            title: seedTitle,
            description: seedDescription,
            siteName: seedSiteName,
            image: seedImage,
          })
        : null,
    [safe, url, seedTitle, seedDescription, seedSiteName, seedImage],
  );

  const preview: LinkPreviewData | null = React.useMemo(() => {
    if (!fallback) return null;
    if (!fetched) return fallback;
    const preferFetchedTitle =
      fetched.title && fetched.title.toLowerCase() !== fetched.domain.toLowerCase();
    return {
      url: fetched.url || fallback.url,
      domain: fetched.domain || fallback.domain,
      title: preferFetchedTitle ? fetched.title : (seedTitle?.trim() || fetched.title || fallback.title),
      description: fetched.description || fallback.description,
      image: fetched.image || fallback.image,
      siteName: fetched.siteName || fallback.siteName,
      favicon: fetched.favicon || fallback.favicon,
    };
  }, [fallback, fetched, seedTitle]);

  React.useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
  }, [preview?.image]);

  const openNow = React.useCallback(() => {
    if (disabled || !safe || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPlaced(computePlacement(rect));
    setOpen(true);
  }, [disabled, safe]);

  const scheduleOpen = React.useCallback(
    (delay: number) => {
      if (disabled || !safe) return;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (open) return;
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (delay <= 0) {
        openNow();
      } else {
        openTimerRef.current = window.setTimeout(openNow, delay);
      }
    },
    [disabled, safe, open, openNow],
  );

  const scheduleClose = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

  const handlePointerEnter = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      scheduleOpen(OPEN_DELAY_MS);
    },
    [scheduleOpen],
  );

  const handlePointerMove = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch" || !cardRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (e.clientX - rect.left) / rect.width - 0.5;
    const shift = Math.max(-14, Math.min(14, ratio * 24));
    cardRef.current.style.setProperty("--lp-shift", `${shift.toFixed(1)}px`);
  }, []);

  const handleFocus = React.useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches?.(":focus-visible")) {
        scheduleOpen(0);
      }
    },
    [scheduleOpen],
  );

  if (!safe) {
    return <span className={className}>{children}</span>;
  }

  const cardStyle: React.CSSProperties | undefined = placed
    ? ({
        left: placed.left,
        ...(placed.side === "top" ? { bottom: placed.anchorY } : { top: placed.anchorY }),
        ["--lp-arrow" as string]: `${placed.arrowLeft}px`,
      } as React.CSSProperties)
    : undefined;

  const showImage = Boolean(preview?.image && !imgFailed);

  const popover =
    open && placed && preview && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`Link preview for ${preview.title}`}
            className="rn-lp-pop"
            data-side={placed.side}
            style={cardStyle}
            onPointerEnter={() => {
              if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
            }}
            onPointerLeave={scheduleClose}
          >
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rn-lp-inner"
              onClick={(e) => e.stopPropagation()}
            >
              {showImage && (
                <div className="rn-lp-media">
                  {!imgLoaded && <div className="skeleton absolute inset-0 rounded-none" aria-hidden />}
                  <img
                    ref={(el) => {
                      if (el?.complete && el.naturalWidth > 0) setImgLoaded(true);
                    }}
                    src={preview.image}
                    alt={preview.title}
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgFailed(true)}
                    className={cn("rn-lp-img", imgLoaded ? "opacity-100" : "opacity-0")}
                  />
                  <span className="rn-lp-media-pill">
                    <SiteFavicon url={preview.url} favicon={preview.favicon} className="size-3" />
                    <span className="truncate">{preview.domain}</span>
                  </span>
                </div>
              )}

              <div className="rn-lp-body">
                <div className="rn-lp-meta">
                  <span className="rn-lp-site">
                    <SiteFavicon url={preview.url} favicon={preview.favicon} className="size-3.5" />
                    <span className="truncate">{preview.siteName || preview.domain}</span>
                  </span>
                  {badge && <span className="rn-lp-badge">{badge}</span>}
                </div>

                <p className="rn-lp-title">{preview.title}</p>

                {preview.description ? (
                  <p className="rn-lp-desc">{preview.description}</p>
                ) : loading ? (
                  <div className="mt-1.5 space-y-1.5" aria-hidden>
                    <div className="skeleton h-2.5 w-full" />
                    <div className="skeleton h-2.5 w-3/4" />
                  </div>
                ) : null}

                <div className="rn-lp-foot">
                  <span className="truncate">{safeDisplayPath(preview.url, 40)}</span>
                  <span className="rn-lp-open">
                    Open
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                  </span>
                </div>
              </div>
            </a>
            <span className="rn-lp-arrow" aria-hidden />
          </div>,
          document.body,
        )
      : null;

  if (as === "span") {
    return (
      <>
        <span
          ref={(el) => {
            triggerRef.current = el;
          }}
          className={cn("inline-flex items-baseline", className)}
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={scheduleClose}
          onFocus={handleFocus}
          onBlur={scheduleClose}
          onClick={onClick}
        >
          {children}
        </span>
        {popover}
      </>
    );
  }

  return (
    <>
      <a
        ref={(el) => {
          triggerRef.current = el;
        }}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={scheduleClose}
        onFocus={handleFocus}
        onBlur={scheduleClose}
        onClick={onClick}
      >
        {children}
      </a>
      {popover}
    </>
  );
});

export interface LinkPreviewCardItem {
  url: string;
  label?: string;
  description?: string;
  siteName?: string;
  image?: string;
}

const SingleLinkPreviewCard = React.memo(function SingleLinkPreviewCard({
  item,
  compact,
}: {
  item: LinkPreviewCardItem;
  compact?: boolean;
}) {
  const [meta, setMeta] = React.useState<LinkPreviewData>(() =>
    previewCache.get(item.url) ??
    buildClientFallback(item.url, {
      title: item.label,
      description: item.description,
      siteName: item.siteName,
      image: item.image,
    }),
  );
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    if (!/^https:\/\//i.test(item.url)) return;
    const cached = previewCache.get(item.url);
    if (cached) {
      setMeta(cached);
      return;
    }
    let alive = true;
    void fetchLinkPreviewClient(item.url).then((res) => {
      if (!alive || !res) return;
      setMeta((prev) => ({
        url: res.url || prev.url,
        domain: res.domain || prev.domain,
        title:
          res.title && res.title.toLowerCase() !== res.domain.toLowerCase()
            ? res.title
            : (item.label || res.title || prev.title),
        description: res.description || prev.description,
        image: res.image || prev.image,
        siteName: res.siteName || prev.siteName,
        favicon: res.favicon || prev.favicon,
      }));
    });
    return () => {
      alive = false;
    };
  }, [item.url, item.label]);

  const showImg = Boolean(meta.image && !imgFailed);

  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={compact ? "rn-lp-card rn-lp-card-tg" : "rn-lp-card"}
      aria-label={`Link preview: ${meta.title}`}
    >
      {showImg && (
        <div className="rn-lp-card-thumb">
          <img
            src={meta.image}
            alt={meta.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        </div>
      )}
      <div className="rn-lp-card-body">
        <div className="rn-lp-card-domain">
          <SiteFavicon url={meta.url} favicon={meta.favicon} className="size-3" />
          <span className="truncate">{meta.siteName || meta.domain}</span>
          <ExternalLink className="ml-auto size-2.5 shrink-0 opacity-65" aria-hidden />
        </div>
        <p className="rn-lp-card-title">{meta.title}</p>
        {meta.description && <p className="rn-lp-card-desc">{meta.description}</p>}
      </div>
    </a>
  );
});

/**
 * Renders a compact, responsive strip of rich OpenGraph Link Preview cards for external URLs
 * detected inside an AI response (rendered once streaming finishes so layout never shifts).
 */
export const LinkPreviewCards = React.memo(function LinkPreviewCards({
  items,
  variant = "playground",
}: {
  items: LinkPreviewCardItem[];
  variant?: "playground" | "telegram";
}) {
  if (!items.length) return null;
  const compact = variant === "telegram";

  return (
    <section
      className={compact ? "rn-lp-strip rn-lp-strip-tg" : "rn-lp-strip"}
      aria-label="Link previews"
    >
      <p className="rn-media-heading">
        <Link2 className="size-3 shrink-0" aria-hidden />
        Link Previews ({items.length})
      </p>
      <div className={compact ? "rn-lp-grid rn-lp-grid-tg" : "rn-lp-grid"}>
        {items.map((item) => (
          <SingleLinkPreviewCard key={item.url} item={item} compact={compact} />
        ))}
      </div>
    </section>
  );
});
