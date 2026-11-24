"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  value,
  onChange,
  className,
  label = "Sections",
  size = "md",
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode; count?: number; badge?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("card flex gap-1 overflow-x-auto p-1.5", size === "sm" && "p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-lg font-semibold transition [&_svg]:size-4",
            size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
            value === t.id ? "btn-primary-bg text-white" : "text-muted hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          {t.icon}
          {t.label}
          {t.badge}
          {t.count !== undefined && <span className="rounded-md bg-white/20 px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
