import { Badge } from "@/components/ui/badge";
import type { BotStatus } from "@/types";

const map: Record<BotStatus, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  inactive: { tone: "warning", label: "Paused" },
  error: { tone: "danger", label: "Error" },
  draft: { tone: "neutral", label: "Draft" },
};

/** Dot + text label so status never relies on colour alone. */
export function StatusBadge({ status, className }: { status: BotStatus; className?: string }) {
  const m = map[status];
  return <Badge tone={m.tone} dot className={className}>{m.label}</Badge>;
}