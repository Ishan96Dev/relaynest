"use client";
import { ArrowRight, Boxes, BrainCircuit, Gift, Layers, Star, Timer } from "lucide-react";
import * as React from "react";
import { canPowerAgent, type ModelDto } from "@backend/server/ai/model-catalog";
import { ProviderMark } from "@/components/ai/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { availabilityLabel, formatTokens, joinModalities } from "@/lib/model-format";
import { cn } from "@/lib/utils";

export function FavoriteButton({ model, onToggle, className }: { model: ModelDto; onToggle: (m: ModelDto) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={model.favorite}
      aria-label={model.favorite ? `Remove ${model.name} from favorites` : `Add ${model.name} to favorites`}
      onClick={(e) => { e.stopPropagation(); onToggle(model); }}
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-foreground/10 hover:text-warn active:scale-90", model.favorite && "text-warn", className)}
    >
      <Star className={cn("size-[18px]", model.favorite && "fill-current")} aria-hidden />
    </button>
  );
}

function badgeTone(m: ModelDto) {
  if (m.badge === "Open Source") return "success" as const;
  if (m.badge === "Efficient") return "warning" as const;
  return "primary" as const;
}

export function ModelCard({ model, selected, compact, onSelect, onToggleFavorite }: {
  model: ModelDto; selected: boolean; compact?: boolean; onSelect: (m: ModelDto) => void; onToggleFavorite: (m: ModelDto) => void;
}) {
  const free = model.isFree;
  const agentReady = canPowerAgent(model);
  return (
    <article
      aria-label={model.name}
      className={cn("lift flex h-full min-w-0 flex-col gap-3 rounded-2xl border bg-gradient-to-b from-surface to-surface-2 p-4 transition", selected ? "border-lavender shadow-[0_0_34px_-10px_rgb(var(--rn-primary))] ring-1 ring-primary/50" : "border-border")}
    >
      <header className="flex items-start gap-3">
        <ProviderMark providerKey={model.providerKey} name={model.providerName} size={compact ? "md" : "lg"} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate font-bold leading-tight", compact ? "text-base" : "text-lg")}>{model.name}</h3>
          <p className="truncate text-sm text-muted">{model.providerName}</p>
        </div>
        {model.badge && <Badge tone={badgeTone(model)} className="rounded-full">{model.badge}</Badge>}
        <FavoriteButton model={model} onToggle={onToggleFavorite} className="-mr-1 -mt-1" />
      </header>

      <p className={cn("text-sm text-foreground/80", compact ? "line-clamp-2" : "line-clamp-2 min-h-10")}>{model.description}</p>

      <ul className="flex flex-wrap gap-1.5" aria-label="Capabilities">
        {model.capabilities.slice(0, 3).map((c) => (
          <li key={c} className="rounded-md border border-border bg-surface-2/80 px-2 py-0.5 text-xs text-foreground/85">{c}</li>
        ))}
      </ul>

      <dl className="mt-auto grid grid-cols-[auto_auto_1fr] items-start gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5"><Layers className="size-4 text-muted" aria-hidden /><div><dt className="sr-only">Parameters</dt><dd className="font-semibold leading-tight">{model.paramsLabel?.split(" ")[0] ?? "N/A"}</dd><dd className="text-muted">Parameters</dd></div></div>
        <div className="flex items-center gap-1.5"><Timer className="size-4 text-muted" aria-hidden /><div><dt className="sr-only">Context</dt><dd className="font-semibold leading-tight">{formatTokens(model.contextTokens)}</dd><dd className="text-muted">Context</dd></div></div>
        <div className="flex min-w-0 items-center gap-1.5"><Boxes className="size-4 shrink-0 text-muted" aria-hidden /><div className="min-w-0"><dt className="sr-only">Modalities</dt><dd className="truncate font-semibold leading-tight">{joinModalities(model.inputModalities)}</dd><dd className="truncate text-muted">Input &rarr; {joinModalities(model.outputModalities)} Output</dd></div></div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={free || model.isOpenSource ? "success" : "neutral"} className="rounded-full py-1">
          {free ? <Gift className="size-3" aria-hidden /> : null}{availabilityLabel(model)}
        </Badge>
        {model.isThinking && <Badge tone="info" className="rounded-full py-1"><BrainCircuit className="size-3" aria-hidden />Thinking</Badge>}
        <Badge tone={agentReady ? "primary" : "neutral"} className="rounded-full py-1">{agentReady ? "Agent-ready" : "Playground"}</Badge>
      </div>

      <Button className="w-full" onClick={() => onSelect(model)} aria-label={`View details for ${model.name}`}>
        View Details <ArrowRight className="size-4" aria-hidden />
      </Button>
    </article>
  );
}
