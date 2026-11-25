"use client";
/* Remote web search thumbnails come from dynamic open-web origins that next/image cannot pre-allowlist. */
/* eslint-disable @next/next/no-img-element */
import { ExternalLink, Film, Globe, Image as ImageIcon, Play } from "lucide-react";
import * as React from "react";
import type { CitationSource } from "@backend/server/ai/citations";
import type { WebImageResult, WebMediaPayload } from "@backend/server/ai/web-search-types";
import { Modal } from "@/components/ui/modal";

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "link";
  }
}

/**
 * Renders open-source web search visual results (image preview strip with lightbox modal,
 * video preview cards with duration & external watch links, and optional Telegram link preview card).
 */
export function WebMediaPanel({
  media,
  sources,
  variant = "playground",
}: {
  media?: WebMediaPayload;
  sources?: CitationSource[];
  variant?: "playground" | "telegram";
}) {
  const [lightbox, setLightbox] = React.useState<WebImageResult | null>(null);
  const [brokenImgs, setBrokenImgs] = React.useState<Record<string, boolean>>({});

  const images = (media?.images ?? []).filter((im) => !brokenImgs[im.thumbnailUrl]);
  const videos = media?.videos ?? [];
  const topLinkSource = variant === "telegram"
    ? sources?.find((s) => s.sourceUrl && /^https:\/\//i.test(s.sourceUrl))
    : undefined;

  if (!images.length && !videos.length && !topLinkSource) return null;

  return (
    <div className={variant === "telegram" ? "rn-media-box rn-media-box-tg" : "rn-media-box"}>
      {media?.engine && (images.length > 0 || videos.length > 0) && (
        <div className="rn-media-meta">
          <Globe className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{media.engine}</span>
        </div>
      )}

      {images.length > 0 && (
        <section aria-label="Web image previews" className="space-y-1.5">
          <p className="rn-media-heading">
            <ImageIcon className="size-3 shrink-0" aria-hidden />
            Images ({images.length})
          </p>
          <div className={variant === "telegram" ? "rn-media-grid rn-media-grid-tg" : "rn-media-grid"}>
            {images.map((im) => (
              <button
                key={im.imageUrl}
                type="button"
                className="rn-media-thumb"
                onClick={() => setLightbox(im)}
                title={`${im.title} (${im.source})`}
              >
                <img
                  src={im.thumbnailUrl}
                  alt={im.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenImgs((b) => ({ ...b, [im.thumbnailUrl]: true }))}
                />
                <span className="rn-media-thumb-cap">{im.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section aria-label="Related videos" className="space-y-1.5">
          <p className="rn-media-heading">
            <Film className="size-3 shrink-0" aria-hidden />
            Videos ({videos.length})
          </p>
          <div className={variant === "telegram" ? "rn-video-grid rn-video-grid-tg" : "rn-video-grid"}>
            {videos.map((v) => (
              <a
                key={v.url}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rn-video-card"
              >
                <div className="rn-video-thumb">
                  {v.thumbnailUrl && !brokenImgs[v.thumbnailUrl] ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenImgs((b) => ({ ...b, [v.thumbnailUrl!]: true }))}
                    />
                  ) : (
                    <div className="rn-video-fallback">
                      <Film className="size-5 opacity-60" aria-hidden />
                    </div>
                  )}
                  <span className="rn-video-play" aria-hidden>
                    <Play className="size-3.5 fill-current" />
                  </span>
                  {v.duration && <span className="rn-video-dur">{v.duration}</span>}
                </div>
                <div className="rn-video-body">
                  <p className="rn-video-title">{v.title}</p>
                  <p className="rn-video-sub">
                    {[v.channel, v.source].filter(Boolean).join(" · ")}
                    <ExternalLink className="inline size-2.5 shrink-0 opacity-70" aria-hidden />
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {topLinkSource?.sourceUrl && (
        <a
          href={topLinkSource.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rn-tg-link-preview"
          aria-label={`Link preview: ${topLinkSource.document}`}
        >
          <span className="rn-tg-lp-domain">{safeDomain(topLinkSource.sourceUrl)}</span>
          <span className="rn-tg-lp-title">{topLinkSource.document}</span>
          {topLinkSource.excerpt && <span className="rn-tg-lp-desc">{topLinkSource.excerpt}</span>}
        </a>
      )}

      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} title={lightbox?.title ?? "Image Preview"} className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {lightbox && (
          <div className="space-y-3">
            <img
              src={lightbox.imageUrl}
              alt={lightbox.title}
              referrerPolicy="no-referrer"
              className="mx-auto block max-h-[68vh] w-auto max-w-full rounded-lg object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Source: {lightbox.source}</span>
              <a
                href={lightbox.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-lavender hover:underline"
              >
                Open original source <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
