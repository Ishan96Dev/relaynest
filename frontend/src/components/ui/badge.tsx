import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "primary" | "info" | "cyan";
const tones: Record<Tone, string> = {
  neutral: "bg-foreground/8 text-muted border-foreground/15",
  success: "bg-success/15 text-ok border-success/35",
  warning: "bg-warning/15 text-warn border-warning/40",
  danger: "bg-danger/15 text-bad border-danger/40",
  primary: "bg-primary/20 text-lavender border-primary/45",
  info: "bg-info/15 text-sky border-info/40",
  cyan: "bg-accent/12 text-accent border-accent/35",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function ComingSoon({ className, label = "Coming Soon" }: { className?: string; label?: string }) {
  return <Badge tone="primary" className={cn("rounded-full", className)}>{label}</Badge>;
}
