"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({
  checked: controlled,
  defaultChecked = false,
  onCheckedChange,
  label,
  disabled,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const [inner, setInner] = React.useState(defaultChecked);
  const checked = controlled ?? inner;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        setInner(!checked);
        onCheckedChange?.(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50",
        checked ? "bg-gradient-to-r from-[#7C5CFF] to-[#9F7BFF] shadow-[0_0_12px_rgb(var(--rn-primary)/0.6)]" : "bg-foreground/15",
      )}
    >
      <span className={cn("inline-block size-[18px] rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}

/** Segmented control (e.g. Auto | Grid | Compact) from the Preferences mockup. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-lg border border-border bg-surface-2/80 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition",
            value === o.id ? "btn-primary-bg text-white" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
