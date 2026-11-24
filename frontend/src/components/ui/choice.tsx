import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type BaseProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label?: React.ReactNode;
  /** "light" is for the white auth panel. */
  tone?: "dark" | "light";
  wrapperClassName?: string;
};

/** Custom checkbox. A real <input> stays in the DOM (visually hidden) so forms, labels and keyboard behave natively. */
export const Checkbox = React.forwardRef<HTMLInputElement, BaseProps>(function Checkbox({ label, tone = "dark", className, wrapperClassName, disabled, ...props }, ref) {
  return (
    <label className={cn("group inline-flex items-center gap-2.5 text-sm", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", wrapperClassName)}>
      <input ref={ref} type="checkbox" disabled={disabled} className={cn("peer sr-only", className)} {...props} />
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[6px] border transition-all duration-200",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-checked:border-transparent peer-checked:bg-gradient-to-b peer-checked:from-[#7C5CFF] peer-checked:to-[#5B34F0] peer-checked:shadow-[0_0_12px_-2px_rgb(var(--rn-primary))]",
          "[&_svg]:scale-0 [&_svg]:text-white [&_svg]:transition-transform [&_svg]:duration-200 peer-checked:[&_svg]:scale-100",
          tone === "light" ? "border-zinc-300 bg-white group-hover:border-primary" : "border-border bg-surface-2 group-hover:border-lavender",
        )}
      >
        <Check className="size-3" strokeWidth={3.5} />
      </span>
      {label !== undefined && <span className={tone === "light" ? "text-zinc-800" : "text-foreground"}>{label}</span>}
    </label>
  );
});

/** Custom radio button, same approach as Checkbox. */
export const Radio = React.forwardRef<HTMLInputElement, BaseProps>(function Radio({ label, tone = "dark", className, wrapperClassName, disabled, ...props }, ref) {
  return (
    <label className={cn("group inline-flex items-center gap-2.5 text-sm", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", wrapperClassName)}>
      <input ref={ref} type="radio" disabled={disabled} className={cn("peer sr-only", className)} {...props} />
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full border transition-all duration-200",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-checked:border-lavender peer-checked:shadow-[0_0_12px_-2px_rgb(var(--rn-primary))]",
          "after:size-2 after:scale-0 after:rounded-full after:bg-lavender after:transition-transform after:duration-200 peer-checked:after:scale-100",
          tone === "light" ? "border-zinc-300 bg-white" : "border-border bg-surface-2 group-hover:border-lavender",
        )}
      />
      {label !== undefined && <span className={tone === "light" ? "text-zinc-800" : "text-foreground"}>{label}</span>}
    </label>
  );
});