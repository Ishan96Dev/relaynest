import * as React from "react";
import { cn } from "@/lib/utils";
import { IconTile, type TileTone } from "./icon-tile";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { glow?: boolean; hover?: boolean }>(
  function Card({ className, glow, hover, ...props }, ref) {
    return <div ref={ref} className={cn(glow ? "card-glow" : "card", "min-w-0", hover && "lift", className)} {...props} />;
  },
);

/**
 * Section header used throughout the mockups: optional icon (plain or in a tinted tile),
 * bold title, muted subtitle, and right-aligned actions.
 */
export function CardHeader({
  title,
  description,
  action,
  icon,
  tile,
  tone = "primary",
  className,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  tile?: boolean;
  tone?: TileTone;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 p-5 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (tile ? <IconTile tone={tone} size="md">{icon}</IconTile> : <span className="rn-card-icon text-lavender [&_svg]:size-5">{icon}</span>)}
        <div className="min-w-0">
          <Tag className="text-lg font-bold leading-tight">{title}</Tag>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
