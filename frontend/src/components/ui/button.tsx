import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip, type TooltipSide } from "./tooltip";

type Variant = "primary" | "outline" | "ghost" | "danger" | "danger-outline" | "subtle" | "gradient";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "btn-primary-bg sheen text-white hover:brightness-110 hover:shadow-[0_10px_28px_-8px_rgb(var(--rn-primary))]",
  gradient: "sheen bg-gradient-to-r from-info to-primary text-white shadow-[0_8px_24px_-10px_rgb(var(--rn-primary))] hover:brightness-110",
  outline: "border border-border bg-surface-2/70 text-foreground hover:-translate-y-px hover:border-lavender/60 hover:bg-primary/10",
  subtle: "border border-primary/40 bg-primary/15 text-foreground hover:-translate-y-px hover:bg-primary/25",
  ghost: "text-muted hover:bg-foreground/5 hover:text-foreground",
  danger: "sheen bg-gradient-to-b from-[#F0506E] to-[#D63355] text-white hover:brightness-110",
  "danger-outline": "border border-danger/60 bg-danger/5 text-bad hover:-translate-y-px hover:bg-danger/15",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition duration-200 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not(.animate-spin)]:transition-transform [&_svg:not(.animate-spin)]:duration-200 hover:[&_svg:not(.animate-spin)]:scale-110",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; tipSide?: TooltipSide };

/** `title` is shown as a custom tooltip (also on disabled buttons) instead of the browser default. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant, size, className, type = "button", title, tipSide, ...props }, ref) {
    return (
      <Tooltip content={title} side={tipSide} className={cn(/\bw-full\b/.test(className ?? "") && "flex w-full", /\bflex-1\b/.test(className ?? "") && "flex-1")}>
        <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />
      </Tooltip>
    );
  },
);

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only button with an accessible name and tooltip. */
export function IconButton({ label, className, side, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; side?: TooltipSide }) {
  return (
    <Tooltip content={label} side={side}>
      <button
        type="button"
        aria-label={label}
        className={cn("inline-grid size-9 place-items-center rounded-lg text-muted transition hover:bg-foreground/10 hover:text-foreground active:scale-95 [&_svg:not(.animate-spin)]:transition-transform [&_svg:not(.animate-spin)]:duration-200 hover:[&_svg:not(.animate-spin)]:scale-110", className)}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
}