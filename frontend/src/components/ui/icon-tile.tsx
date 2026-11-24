import { cn } from "@/lib/utils";

export type TileTone = "primary" | "success" | "danger" | "info" | "cyan" | "warning" | "pink" | "amber" | "neutral";

const tones: Record<TileTone, string> = {
  primary: "bg-primary/20 text-lavender ring-primary/35",
  success: "bg-success/15 text-ok ring-success/30",
  danger: "bg-danger/15 text-bad ring-danger/30",
  info: "bg-info/20 text-sky ring-info/35",
  cyan: "bg-accent/15 text-accent ring-accent/30",
  warning: "bg-warning/15 text-warn ring-warning/30",
  pink: "bg-[#EC4899]/15 text-bad ring-[#EC4899]/30",
  amber: "bg-[#B45309]/25 text-warn ring-[#F59E0B]/30",
  neutral: "bg-foreground/8 text-muted ring-foreground/10",
};

const sizes = {
  sm: "size-8 rounded-lg [&_svg]:size-4",
  md: "size-10 rounded-xl [&_svg]:size-5",
  lg: "size-12 rounded-xl [&_svg]:size-6",
  xl: "size-14 rounded-2xl [&_svg]:size-7",
};

/** Colour-tinted square holding an icon, as used for KPI cards and list rows in the mockups. */
export function IconTile({
  tone = "primary",
  size = "md",
  animate = "none",
  className,
  children,
}: {
  tone?: TileTone;
  size?: keyof typeof sizes;
  animate?: "none" | "float";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "rn-icon-tile grid shrink-0 place-items-center ring-1 ring-inset",
        animate === "float" && "rn-icon-float",
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
