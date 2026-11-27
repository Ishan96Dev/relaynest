"use client";
/* The avatar can be a local blob URL, which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import { ArrowLeft, Bot, MoreVertical, Paperclip, Send, Smile } from "lucide-react";
import * as React from "react";
import type { CitationSource } from "@backend/server/ai/citations";
import type { AgenticPayload } from "@backend/server/ai/market-data-types";
import type { WebMediaPayload } from "@backend/server/ai/web-search-types";
import { AgenticActivityPanel } from "@/components/ai/agentic-activity-panel";
import { CitedText, MessageLinkPreviews, SourcesPanel } from "@/components/ai/citations-panel";
import { CopyBubbleButton } from "@/components/ai/copy-bubble-button";
import { WebMediaPanel } from "@/components/ai/web-media-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  from: "user" | "bot";
  text: string;
  time: string;
  error?: boolean;
  image?: string;
  sources?: CitationSource[];
  webMedia?: WebMediaPayload;
  agentic?: AgenticPayload;
  ms?: number;
}

const nowTime = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const GREETING = (name: string): Msg => ({ id: 1, from: "bot", text: `Hi! I'm ${name}. How can I help?`, time: nowTime() });
const sniffMime = (b64: string) => (b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("UklGR") ? "image/webp" : "image/jpeg");

/**
 * Telegram-style chat. With `onAsk` it talks to the real agent (saved settings); without it, it shows a canned reply
 * so the layout can be judged before the agent exists.
 */
export function TelegramPreview({ name, avatar, onAsk, note }: {
  name: string;
  avatar: string | null;
  onAsk?: (
    history: { role: "user" | "assistant"; content: string }[],
    message: string,
  ) => Promise<{ ok: true; reply: string; imageBase64?: string; sources?: CitationSource[]; webMedia?: WebMediaPayload; agentic?: AgenticPayload; ms?: number } | { ok: false; message: string }>;
  note?: string;
}) {
  const title = name || "Your AI Agent";
  const [msgs, setMsgs] = React.useState<Msg[]>(() => [GREETING(title)]);
  const [activeCite, setActiveCite] = React.useState<Record<number, number | null>>({});
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const logRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number>(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [msgs, typing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    const time = nowTime();
    const history = msgs.filter((m) => !m.error && m.id !== 1).map((m) => ({ role: m.from === "user" ? ("user" as const) : ("assistant" as const), content: m.text }));
    setMsgs((m) => [...m, { id: Date.now(), from: "user", text: text.slice(0, 500), time }]);
    setDraft("");
    setTyping(true);
    if (!onAsk) {
      timer.current = window.setTimeout(() => {
        setTyping(false);
        setMsgs((m) => [...m, { id: Date.now() + 1, from: "bot", text: "Save this agent and pick a model to get real answers here.", time }]);
      }, 900);
      return;
    }
    const r = await onAsk(history, text);
    setTyping(false);
    setMsgs((m) => [
      ...m,
      r.ok
        ? {
            id: Date.now() + 1,
            from: "bot",
            text: r.reply,
            time: nowTime(),
            image: r.imageBase64 ? `data:${sniffMime(r.imageBase64)};base64,${r.imageBase64}` : undefined,
            sources: r.sources?.length ? r.sources : undefined,
            webMedia: r.webMedia,
            agentic: r.agentic,
            ms: r.ms,
          }
        : { id: Date.now() + 1, from: "bot", text: r.message, time: nowTime(), error: true },
    ]);
  }

  const avatarEl = (className?: string) => (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/25 text-lavender", className)} aria-hidden>
      {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <Bot className="size-[58%]" />}
    </span>
  );

  return (
    <Card className="flex min-h-0 flex-col p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <IconTile tone="info" size="md"><Send /></IconTile>
          <div>
            <h3 className="text-lg font-bold leading-tight">Telegram Preview</h3>
            <p className="text-sm text-muted">See how your AI agent will chat with users.</p>
          </div>
        </div>
        <Badge tone={onAsk ? "success" : "primary"} dot={Boolean(onAsk)} className="rounded-full">{onAsk ? "Live Preview" : "Preview"}</Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-2/70">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          <ArrowLeft className="size-5 text-muted" aria-hidden />
          {avatarEl("size-9")}
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate font-bold">{title}</p><p className="text-xs text-muted">bot</p></div>
          <MoreVertical className="size-5 text-muted" aria-hidden />
        </div>

        <div ref={logRef} className="rn-chat-log h-[340px] space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3" role="log" aria-label="Conversation preview" aria-live="polite">
          <p className="mx-auto w-fit rounded-full bg-foreground/10 px-3 py-0.5 text-xs text-muted">Today</p>
          {msgs.map((m) => {
            const activeIdx = activeCite[m.id] ?? null;
            return (
              <div key={m.id} className={cn("flex items-end gap-2", m.from === "user" && "justify-end")}>
                {m.from === "bot" && avatarEl("size-7")}
                <div className={cn("max-w-[84%] rounded-2xl px-3 py-2 text-sm", m.from === "user" ? "btn-primary-bg rounded-br-sm text-white" : m.error ? "rounded-bl-sm bg-danger/10 text-bad ring-1 ring-danger/40" : "rounded-bl-sm bg-surface text-foreground ring-1 ring-border")}>
                  {m.image && <img src={m.image} alt={m.text || "Generated image"} className="mb-1.5 h-auto max-h-64 w-full rounded-lg object-contain" />}
                  {m.from === "bot" && !m.error && m.agentic && (
                    <AgenticActivityPanel steps={m.agentic.steps} quotes={m.agentic.marketQuotes} variant="telegram" />
                  )}
                  {(m.text || !m.image) && (
                    m.from === "bot" && !m.error ? (
                      <>
                        {m.text.length > 260 && (
                          <div className="mb-1 flex justify-end">
                            <CopyBubbleButton text={m.text} tone="assistant" label="Copy response" />
                          </div>
                        )}
                        <CitedText
                          text={m.text}
                          sources={m.sources}
                          activeIndex={activeIdx}
                          onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [m.id]: prev[m.id] === idx ? null : idx }))}
                          variant="telegram"
                        />
                      </>
                    ) : m.from === "user" ? (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{m.text}</p>
                        <CopyBubbleButton text={m.text} tone="user" label="Copy query" />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    )
                  )}
                  {m.from === "bot" && !m.error && (
                    <MessageLinkPreviews text={m.text} sources={m.sources} webMedia={m.webMedia} variant="telegram" />
                  )}
                  {m.from === "bot" && !m.error && (m.webMedia || m.sources?.some((s) => s.sourceUrl)) && (
                    <WebMediaPanel media={m.webMedia} sources={m.sources} variant="telegram" />
                  )}
                  {m.from === "bot" && m.sources && m.sources.length > 0 && (
                    <SourcesPanel
                      text={m.text}
                      sources={m.sources}
                      activeIndex={activeIdx}
                      onSelect={(idx) => setActiveCite((prev) => ({ ...prev, [m.id]: idx }))}
                      variant="telegram"
                    />
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {m.from === "bot" && m.text ? (
                      <CopyBubbleButton text={m.text} tone="assistant" label="Copy response" />
                    ) : (
                      <span />
                    )}
                    <p className={cn("text-right text-[10px]", m.from === "user" ? "text-white/70" : "text-muted")}>
                      {m.ms !== undefined ? `${(m.ms / 1000).toFixed(1)}s · ` : ""}{m.time}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          {typing && (
            <div className="flex items-end gap-2" aria-label="The agent is typing">
              {avatarEl("size-7")}
              <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-surface px-3 py-3 ring-1 ring-border" aria-hidden>
                {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 160}ms` }} />)}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-2.5">
          <Smile className="size-5 shrink-0 text-muted" aria-hidden />
          <input aria-label="Type a message to preview" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Ask naturally, /stock RELIANCE, /brief, /search ..."
            className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted focus:outline-none" />
          <Paperclip className="size-5 shrink-0 text-muted" aria-hidden />
          <button type="submit" aria-label="Send" disabled={!draft.trim() || typing} className="btn-primary-bg grid size-9 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-50">
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </Card>
  );
}
