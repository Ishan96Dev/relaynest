"use client";
/* The generated image is a base64 data URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import { Check, Copy, Download, ExternalLink, Maximize2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";

/** Decodes a base64 string into a Blob without going through fetch (data URLs can be blocked by CSP). */
function toBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Shows a generated image at its own aspect ratio, centered, with Download, Copy and full-size view.
 * The format is read from the data; copying converts to PNG because browsers only accept PNG on the clipboard.
 */
/** Providers return raw base64 without a type, so read it from the first bytes. */
const sniffMime = (b64: string) => (b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("UklGR") ? "image/webp" : "image/jpeg");

export function ImageResult({
  base64,
  prompt,
  revisedPrompt,
  name,
  seconds,
}: {
  base64: string;
  prompt: string;
  revisedPrompt?: string;
  name: string;
  seconds?: number;
}) {
  const mime = sniffMime(base64);
  const src = `data:${mime};base64,${base64}`;
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [copied, setCopied] = React.useState<"idle" | "ok" | "error">("idle");
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number>(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  React.useEffect(() => { setSize(null); setCopied("idle"); }, [base64]);

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filename = `${slugify(name)}-${slugify(prompt)}.${ext}`;

  function download() {
    const url = URL.createObjectURL(toBlob(base64, mime));
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("encode");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("ok");
    } catch {
      setCopied("error"); // clipboard blocked (insecure origin or permission denied)
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <figure className="space-y-3">
      <div className="flex justify-center rounded-2xl border border-border bg-surface-2/70 p-3 sm:p-4">
        <button type="button" onClick={() => setOpen(true)} aria-label="View full size" className="group relative max-w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <img
            src={src} alt={prompt} draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="block h-auto max-h-[min(70vh,640px)] w-auto max-w-full rounded-xl object-contain shadow-[0_12px_40px_-12px_rgb(0_0_0/0.6)]"
          />
          <span className="pointer-events-none absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="size-4" aria-hidden /></span>
        </button>
      </div>

      <figcaption className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-0 text-xs text-muted">
          {size ? `${size.w} \u00d7 ${size.h}px` : "Loading..."}{seconds !== undefined && ` \u2022 ${seconds.toFixed(1)}s`} &bull; {ext.toUpperCase()}
        </p>
        <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
          {copied === "ok" ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied === "ok" ? "Copied" : copied === "error" ? "Copy failed" : "Copy image"}
        </Button>
        <Button size="sm" onClick={download}><Download className="size-3.5" aria-hidden />Download</Button>
      </figcaption>
      {copied === "error" && <p role="alert" className="text-xs text-bad">Your browser blocked copying the image. Use Download instead.</p>}
      {revisedPrompt && (
        <details className="rounded-xl border border-border/80 bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-foreground/80">Enhanced detail prompt used</summary>
          <p className="mt-1.5 leading-relaxed text-muted">{revisedPrompt}</p>
        </details>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={name} className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <img src={src} alt={prompt} className="mx-auto block h-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain" />
        <p className="mt-3 text-xs text-muted">{revisedPrompt || prompt}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copy}><Copy className="size-3.5" aria-hidden />Copy image</Button>
          <Button size="sm" onClick={download}><Download className="size-3.5" aria-hidden />Download</Button>
          <Button variant="ghost" size="sm" onClick={() => { const w = window.open(URL.createObjectURL(toBlob(base64, mime)), "_blank", "noopener"); if (!w) setCopied("idle"); }}><ExternalLink className="size-3.5" aria-hidden />Open in new tab</Button>
        </div>
      </Modal>
    </figure>
  );
}
