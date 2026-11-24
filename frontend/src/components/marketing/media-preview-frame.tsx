"use client";

import Image from "next/image";
import * as React from "react";
import { FullscreenMediaModal, FullscreenTriggerButton, type FullscreenMediaItem } from "@/components/ui/media-fullscreen-modal";
import { cn } from "@/lib/utils";

/** Standalone client wrapper adding a Fullscreen Viewer trigger to any hero/marketing preview image. */
export function MediaPreviewFrame({
  src,
  alt,
  pageTitle = "Dashboard Preview",
  caption,
  width,
  height,
  priority,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  pageTitle?: string;
  caption?: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);
  const item: FullscreenMediaItem = { kind: "image", src, alt, pageTitle, caption: caption ?? alt };

  return (
    <div className={cn("group relative", className)}>
      <FullscreenTriggerButton
        label={`View full screen: ${alt}`}
        onClick={(e) => {
          openerRef.current = e.currentTarget;
          setOpen(true);
        }}
        className="absolute right-4 top-4 z-10 opacity-85 transition group-hover:opacity-100 focus-visible:opacity-100"
      />
      <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes={sizes} className="h-auto w-full rounded-xl" />
      {open && (
        <FullscreenMediaModal
          items={[item]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => openerRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
