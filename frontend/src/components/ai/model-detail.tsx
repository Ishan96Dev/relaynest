"use client";
import { ArrowLeftRight, ArrowRight, Bot, BrainCircuit, Check, CheckCircle2, Copy, ExternalLink, Layers, Play, ScrollText, Sparkles, Timer, Type, X } from "lucide-react";
import * as React from "react";
import { canPowerAgent, type ModelDto } from "@backend/server/ai/model-catalog";
import { FavoriteButton } from "@/components/ai/model-card";
import { ProviderMark } from "@/components/ai/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { InfoTip } from "@/components/ui/tooltip";
import { templateForModel } from "@/lib/agent-templates";
import { apiRequest, availabilityLabel, formatDate, formatTokens, joinModalities, keyCapabilities, listModalities, quickStart, type Lang } from "@/lib/model-format";
import { cn } from "@/lib/utils";

const LANGS: { id: Lang; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
  { id: "curl", label: "cURL" },
];

function Spec({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-2/70 p-3">
      <span className="text-lavender [&_svg]:size-6" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight">{value}</p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function CodeBlock({ model }: { model: ModelDto }) {
  const [lang, setLang] = React.useState<Lang>("python");
  const [copied, setCopied] = React.useState(false);
  const code = quickStart(model, lang);
  const lines = code.split("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: leave the button unchanged */ }
  }
  return (
    <section aria-labelledby="quickstart-title">
      <h3 id="quickstart-title" className="mb-2 text-base font-bold">Quick Start (API Example)</h3>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Language" className="flex gap-1.5">
          {LANGS.map((l) => (
            <button key={l.id} role="tab" type="button" aria-selected={lang === l.id} onClick={() => setLang(l.id)}
              className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold transition", lang === l.id ? "border-primary/60 bg-primary/25 text-foreground" : "border-border text-muted hover:text-foreground")}>
              {l.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-background/70 p-3 text-xs leading-relaxed" tabIndex={0} aria-label={`${model.name} example request`}>
        <code className="grid grid-cols-[auto_1fr] gap-x-3">
          {lines.map((line, i) => (
            <React.Fragment key={i}>
              <span className="select-none text-right text-muted/60" aria-hidden>{i + 1}</span>
              <span className={cn("whitespace-pre", /^\s*(#|\/\/)/.test(line) && "text-ok")}>{line || " "}</span>
            </React.Fragment>
          ))}
        </code>
      </pre>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

export function ModelDetail({ model, onClose, onToggleFavorite, className }: {
  model: ModelDto; onClose?: () => void; onToggleFavorite: (m: ModelDto) => void; className?: string;
}) {
  const [tab, setTab] = React.useState("overview");
  // A newly selected model starts on Overview.
  React.useEffect(() => setTab("overview"), [model.slug]);
  const sourceLabel = model.source === "nvidia" ? "NVIDIA Build" : "Vercel AI Gateway";
  const req = apiRequest(model);
  const template = templateForModel(model.slug);

  return (
    <div className={cn("@container space-y-4", className)}>
      <header className="flex items-start gap-3">
        <ProviderMark providerKey={model.providerKey} name={model.providerName} size="lg" className="size-14" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{model.name}</h2>
          <p className="mt-0.5 truncate text-sm text-muted">{model.providerName}{model.sourceUpdatedAt && <> &bull; Last updated: {formatDate(model.sourceUpdatedAt)}</>}</p>
        </div>
        <FavoriteButton model={model} onToggle={onToggleFavorite} />
        {onClose && <IconButton label="Close details" onClick={onClose}><X className="size-5" /></IconButton>}
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {model.badge && <Badge tone="primary" className="rounded-full">{model.badge}</Badge>}
        {model.isThinking && <Badge tone="info" className="rounded-full"><BrainCircuit className="size-3" aria-hidden />Thinking</Badge>}
        {model.capabilities.slice(0, 3).map((c) => <Badge key={c} tone="neutral" className="rounded-full">{c}</Badge>)}
        <Badge tone={model.isFree || model.isOpenSource ? "success" : "neutral"} dot className="ml-auto rounded-full">{availabilityLabel(model)}</Badge>
      </div>

      <p className="text-sm text-foreground/85">{model.description}</p>

      <div className="grid grid-cols-2 gap-2.5">
        <Spec icon={<Layers />} value={model.paramsLabel ?? "N/A"} label="Parameters" />
        <Spec icon={<Timer />} value={formatTokens(model.contextTokens)} label="Context Length" />
        <Spec icon={<ArrowLeftRight />} value={listModalities(model.inputModalities)} label="Input" />
        <Spec icon={<Type />} value={joinModalities(model.outputModalities)} label="Output" />
      </div>

      <Tabs
        size="sm"
        label="Model sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "card", label: "Model Card" },
          { id: "api", label: "API Reference" },
          { id: "playground", label: "Playground" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 @xl:grid-cols-[1.2fr_1fr]">
            <section aria-labelledby="overview-title">
              <h3 id="overview-title" className="mb-1.5 text-base font-bold">Model Overview</h3>
              <p className="text-sm leading-relaxed text-foreground/80">
                {model.name} is provided by {model.providerName} and listed on {sourceLabel}. It accepts {listModalities(model.inputModalities).toLowerCase()} input and returns {listModalities(model.outputModalities).toLowerCase()}
                {model.contextTokens ? ` with a ${formatTokens(model.contextTokens)}-token context window` : ""}.
              </p>
            </section>
            <section aria-labelledby="caps-title" className="rounded-xl border border-border bg-surface-2/70 p-3">
              <h3 id="caps-title" className="mb-1.5 text-base font-bold">Key Capabilities</h3>
              <ul className="space-y-1 text-sm">
                {keyCapabilities(model).map((c) => (
                  <li key={c} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{c}</li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid gap-3 @md:grid-cols-2">
            <section aria-labelledby="avail-title" className="rounded-xl border border-border bg-surface-2/70 p-3">
              <h3 id="avail-title" className="mb-2 text-base font-bold">Model Availability</h3>
              <p className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 rounded-full", model.isFree ? "bg-success" : "bg-muted")} aria-hidden />
                {model.isFree ? "Free Endpoint (Preview)" : model.source === "vercel" ? "Via Vercel AI Gateway (pricing varies)" : "Preview"}
                <InfoTip content="Availability is set by the upstream provider and can change. You need a provider API key configured on the server to run it." />
              </p>
            </section>
            <section aria-labelledby="deploy-title" className="rounded-xl border border-border bg-surface-2/70 p-3">
              <h3 id="deploy-title" className="mb-2 text-base font-bold">Deployment Options</h3>
              <ul className="flex flex-wrap gap-1.5">
                {model.deployment.map((d) => <li key={d} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold">{d}</li>)}
              </ul>
            </section>
          </div>

          <CodeBlock model={model} />
        </div>
      )}

      {tab === "card" && (
        <dl className="rounded-xl border border-border bg-surface-2/70 px-3">
          <Row label="Provider">{model.providerName}</Row>
          <Row label="Listed on">{sourceLabel}</Row>
          <Row label="Model ID"><code className="text-xs">{model.apiModelId}</code></Row>
          <Row label="Type">{model.modelType.replace("_", " ")}</Row>
          <Row label="Parameters">{model.paramsLabel ?? "Not disclosed"}</Row>
          <Row label="Context window">{model.contextTokens ? `${model.contextTokens.toLocaleString("en-US")} tokens` : "Not specified"}</Row>
          {model.maxOutputTokens && <Row label="Max output">{model.maxOutputTokens.toLocaleString("en-US")} tokens</Row>}
          <Row label="Input">{listModalities(model.inputModalities)}</Row>
          <Row label="Output">{listModalities(model.outputModalities)}</Row>
          <Row label="License">{model.license ?? "See provider"}</Row>
          <Row label="Released">{formatDate(model.releasedAt)}</Row>
          <Row label="Last updated">{formatDate(model.sourceUpdatedAt)}</Row>
        </dl>
      )}

      {tab === "api" && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2/70 p-3 text-sm">
          <p className="flex items-start gap-2"><ScrollText className="mt-0.5 size-4 shrink-0 text-lavender" aria-hidden />RelayNest calls this model through its provider&apos;s API. You can call the same endpoint yourself with your own key.</p>
          <dl>
            <Row label="Endpoint"><code className="break-all text-xs">POST {req.url}</code></Row>
            <Row label="Model"><code className="text-xs">{model.apiModelId}</code></Row>
            <Row label="Auth"><code className="text-xs">Authorization: Bearer ${"{"}{req.keyName}{"}"}</code></Row>
          </dl>
          <a href={model.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-lavender hover:underline">
            Open the {sourceLabel} page <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      )}
      {tab === "playground" && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-5 text-center">
          <Play className="mx-auto size-8 text-lavender" aria-hidden />
          <p className="mt-2 text-sm text-foreground/80">Send prompts to {model.name} and see its answers, token usage and latency.</p>
          <ButtonLink href={`/ai/playground?model=${encodeURIComponent(model.slug)}`} className="mt-3">Open in Playground <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/ai/playground?model=${encodeURIComponent(model.slug)}`} size="sm"><Play className="size-4" aria-hidden />Try in Playground</ButtonLink>
        {template && <ButtonLink href={`/bots/new?type=ai&template=${template.id}`} variant="subtle" size="sm"><Sparkles className="size-4" aria-hidden />Template: {template.name}</ButtonLink>}
        {canPowerAgent(model) && <ButtonLink href={`/bots/new?type=ai&model=${encodeURIComponent(model.slug)}`} variant="subtle" size="sm"><Bot className="size-4" aria-hidden />Use in an AI Agent Bot</ButtonLink>}
        <a href={model.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold transition hover:border-lavender/60">
          <ExternalLink className="size-3.5" aria-hidden />View on {sourceLabel}
        </a>
      </div>
    </div>
  );
}
