import { ArrowUp } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const borders: Record<string, string> = {
  primary: "border-lavender/60 shadow-[0_0_30px_-12px_rgb(var(--rn-primary))]",
  success: "border-success/55 shadow-[0_0_30px_-14px_rgb(var(--rn-success))]",
  info: "border-info/55 shadow-[0_0_30px_-14px_rgb(var(--rn-info))]",
  cyan: "border-accent/50 shadow-[0_0_30px_-14px_rgb(var(--rn-accent))]",
  danger: "border-danger/50 shadow-[0_0_30px_-14px_rgb(var(--rn-danger))]",
  none: "border-border",
};

/** KPI tile: tinted icon, label with optional info hint, big number and a delta pill. */
export function StatCard({
  label, value, delta, icon, tone = "primary", note, hint, subtle,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: React.ReactNode;
  tone?: TileTone;
  note?: string;
  hint?: string;
  /** Neutral border (used on analytics/billing style pages). */
  subtle?: boolean;
}) {
  const negative = delta?.startsWith("-") || tone === "danger";
  const border = subtle ? borders.none : (borders[tone] ?? borders.primary);
  return (
    <div className={cn("lift group relative flex items-center gap-4 rounded-2xl border bg-gradient-to-b from-surface to-surface-2 p-4", border)}>
      <IconTile tone={tone} size="xl" className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">{icon}</IconTile>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground/90">{label}</p>
        <p className="text-[28px] font-extrabold leading-tight tracking-tight"><CountUp value={value} /></p>
        {note && <p className="text-[11px] text-muted">{note}</p>}
      </div>
      {hint && <InfoTip content={hint} className="absolute right-3 top-3" />}
      {delta && (
        <span className={cn("absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", negative ? "bg-danger/15 text-bad" : "bg-success/15 text-ok")}>
          <ArrowUp className={cn("size-3", negative && "rotate-45")} aria-hidden />
          {delta}
        </span>
      )}
    </div>
  );
}