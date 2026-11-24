"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertCircle, Check, Clock, Code2, Globe, GitBranch, MessageSquare, Send, Webhook, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { specFor } from "./node-specs";

const icons: Record<string, LucideIcon> = {
  "trigger.telegram.message": Send, "trigger.webhook": Webhook, "trigger.schedule": Clock,
  "action.telegram.sendMessage": MessageSquare, "action.http.request": Globe,
};

export interface FlowNodeData extends Record<string, unknown> { type: string; error?: boolean; ok?: boolean }

const ring: Record<string, string> = {
  trigger: "border-info/80 shadow-[0_0_28px_-8px_rgb(var(--rn-info))]",
  condition: "border-lavender/80 shadow-[0_0_28px_-8px_rgb(var(--rn-primary))]",
  action: "border-info/80 shadow-[0_0_28px_-8px_rgb(var(--rn-info))]",
};

export function FlowNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const spec = specFor(d.type);
  const kind = d.type.split(".")[0] ?? "action";
  const Icon = icons[d.type] ?? (kind === "condition" ? GitBranch : Code2);
  return (
    <div className={cn("w-[260px] rounded-2xl border-2 bg-surface p-3.5", ring[kind], selected && "ring-2 ring-white/70", d.error && "!border-danger")}>
      {kind !== "trigger" && <Handle type="target" position={Position.Top} className="!size-3 !border-2 !border-background !bg-lavender" />}
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset", kind === "condition" ? "bg-primary/30 text-lavender ring-primary/50" : "bg-info/25 text-sky ring-info/40")} aria-hidden><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{spec.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-foreground/70">{spec.description}</p>
        </div>
        {d.error ? <AlertCircle className="size-5 text-bad" aria-label="Configuration error" />
          : d.ok ? <span className="grid-cols-1 grid size-5 place-items-center rounded-full bg-success text-white" role="img" aria-label="Configuration valid"><Check className="size-3.5" strokeWidth={3} /></span> : null}
      </div>
      {kind === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "28%" }} className="!size-3 !border-2 !border-background !bg-success" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "72%" }} className="!size-3 !border-2 !border-background !bg-danger" />
          <div className="mt-3 flex justify-around text-[10px] font-bold"><span className="text-ok">Yes</span><span className="text-bad">No</span></div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!size-3 !border-2 !border-background !bg-lavender" />
      )}
    </div>
  );
}