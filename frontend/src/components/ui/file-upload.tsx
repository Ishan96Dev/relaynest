"use client";
/* Storage images are small, pre-resized user uploads served from the Supabase CDN, so next/image optimization adds nothing. */
/* eslint-disable @next/next/no-img-element */
import { AlertCircle, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/** Center-crops to a square and downsizes in the browser, so uploads stay tiny and consistently shaped. */
async function toSquareBlob(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("encode");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** What the user chose but has not saved yet. Nothing is uploaded until the parent form saves. */
export type PendingImage = { kind: "none" } | { kind: "set"; blob: Blob } | { kind: "remove" };
export const NO_PENDING: PendingImage = { kind: "none" };

export interface FileUploadProps {
  /** Currently saved image URL, if any. */
  value: string | null;
  /** Staged change, owned by the parent form. */
  pending: PendingImage;
  /** Called when the user picks, removes or undoes. The parent uploads on Save. */
  onPendingChange: (next: PendingImage) => void;
  /** True while the parent is saving: shows the progress ring and locks the control. */
  saving?: boolean;
  /** Shown inside the preview when there is no image (for example the user's initials). */
  fallback?: React.ReactNode;
  shape?: "circle" | "square";
  /** Stacked layout for narrow columns. */
  compact?: boolean;
  /** Output edge length in pixels (never upscaled). */
  size?: number;
  maxBytes?: number;
  accept?: string[];
  title?: string;
  hint?: string;
  disabled?: boolean;
  /** Explains why the control is disabled. */
  disabledReason?: string;
  className?: string;
}

export function FileUpload({
  value, pending, onPendingChange, saving, fallback, shape = "circle", compact, size = 512, maxBytes = 2 * 1024 * 1024,
  accept = ["image/webp", "image/png", "image/jpeg"], title = "Choose an image", hint, disabled, disabledReason, className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);
  const [drag, setDrag] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const locked = Boolean(disabled || saving || processing);

  const stagedUrl = React.useMemo(() => (pending.kind === "set" ? URL.createObjectURL(pending.blob) : null), [pending]);
  React.useEffect(() => () => { if (stagedUrl) URL.revokeObjectURL(stagedUrl); }, [stagedUrl]);

  async function handle(file: File | undefined) {
    if (!file || locked) return;
    setError(undefined);
    if (!accept.includes(file.type)) return setError(`Use a ${accept.map((t) => t.replace("image/", "").toUpperCase()).join(", ")} image.`);
    if (file.size > MAX_INPUT_BYTES) return setError("That image is larger than 12 MB.");
    setProcessing(true);
    try {
      const blob = await toSquareBlob(file, size);
      if (blob.size > maxBytes) return setError(`The image is still larger than ${Math.round(maxBytes / 1048576)} MB after resizing.`);
      onPendingChange({ kind: "set", blob });
    } catch {
      setError("We couldn't read that image. Try another file.");
    } finally {
      setProcessing(false);
    }
  }

  const open = () => { if (!locked) inputRef.current?.click(); };
  const shown = pending.kind === "remove" ? null : stagedUrl ?? value;
  const isPending = pending.kind !== "none";
  const busy = processing || Boolean(saving);

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-label={`${title}. ${disabledReason ?? "Drop an image here or press Enter to browse."}`}
        title={disabled ? disabledReason : undefined}
        className="dz"
        data-drag={drag}
        data-compact={compact}
        data-state={error ? "error" : isPending ? "pending" : "idle"}
        data-disabled={locked}
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        onDragEnter={(e) => { e.preventDefault(); depth.current++; if (!locked) setDrag(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); depth.current = 0; setDrag(false); void handle(e.dataTransfer.files[0]); }}
      >
        <span className="dz-preview" data-shape={shape} data-busy={busy} aria-hidden>
          {shown ? <img src={shown} alt="" draggable={false} /> : <span className="dz-fallback">{fallback ?? <ImagePlus className="size-7" />}</span>}
        </span>
        <span className="dz-copy">
          <span className="dz-title">
            {drag ? "Drop to select" : processing ? "Preparing image..." : saving ? "Uploading..." : pending.kind === "set" ? "New image selected" : pending.kind === "remove" ? "Image will be removed" : title}
          </span>
          <span className="dz-hint">
            {disabled && disabledReason ? disabledReason : isPending ? "Not uploaded yet. Click Save to apply it." : hint ?? "Drag and drop, or click to browse. JPG, PNG or WebP."}
          </span>
          {busy && <span className="dz-bar" aria-hidden><i /></span>}
        </span>
        <span className="dz-cta" aria-hidden><ImagePlus className="size-4" />Browse</span>
        <input
          ref={inputRef} type="file" accept={accept.join(",")} className="sr-only" tabIndex={-1} disabled={locked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void handle(f); }}
        />
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <p aria-live="polite" className="flex items-center gap-1.5 text-sm text-bad">
          {error && <><AlertCircle className="size-4" aria-hidden />{error}</>}
        </p>
        <span className="ml-auto flex gap-2">
          {isPending && (
            <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => { setError(undefined); onPendingChange(NO_PENDING); }}><RotateCcw className="size-3.5" />Undo</Button>
          )}
          {!isPending && value && !disabled && (
            <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => onPendingChange({ kind: "remove" })}><Trash2 className="size-3.5" />Remove</Button>
          )}
        </span>
      </div>
    </div>
  );
}
