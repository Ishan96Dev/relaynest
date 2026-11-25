"use client";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import * as React from "react";
import { orderSourcesByCitation, type CitationSource, type RetrievalMode } from "@backend/server/ai/citations";

const MODE_LABELS: Record<RetrievalMode, string> = {
  hybrid: "Hybrid RAG",
  vector: "Vector RAG",
  keyword: "Keyword RAG",
  overview: "Document RAG",
  agent: "Agent Knowledge",
  none: "Knowledge",
};

/**
 * Splits assistant text on bracketed citation markers like [1] or [1, 2] and turns valid markers
 * into interactive citation pills (custom CSS for Playground and Telegram Preview).
 */
export function CitedText({
  text,
  sources,
  activeIndex,
  onSelect,
  variant = "playground",
  streaming = false,
}: {
  text: string;
  sources?: CitationSource[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  variant?: "playground" | "telegram";
  streaming?: boolean;
}) {
  const byIdx = React.useMemo(() => new Map((sources ?? []).map((s) => [s.index, s])), [sources]);
  const chipClass = variant === "telegram" ? "rn-tg-cite" : "rn-cite-chip";

  const nodes = React.useMemo(() => {
    if (!sources?.length) return text;
    const parts: React.ReactNode[] = [];
    const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const nums = m[1]!.split(",").map((x) => Number.parseInt(x.trim(), 10));
      if (!nums.every((n) => byIdx.has(n))) continue;
      if (m.index > last) parts.push(text.slice(last, m.index));
      nums.forEach((n, j) => {
        const src = byIdx.get(n)!;
        parts.push(
          <button
            key={`${m!.index}-${n}-${j}`}
            type="button"
            className={chipClass}
            data-active={activeIndex === n ? "true" : undefined}
            title={`[${n}] ${src.document}${src.collection ? ` (${src.collection})` : ""}`}
            aria-label={`Citation ${n}: ${src.document}`}
            onClick={() => onSelect(n)}
          >
            [{n}]
          </button>,
        );
      });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }, [text, sources, byIdx, chipClass, activeIndex, onSelect]);

  return (
    <p className="whitespace-pre-wrap break-words">
      {nodes}
      {streaming && <span className="rn-stream-cursor" aria-hidden />}
    </p>
  );
}

/**
 * Renders the grounded Sources & Citations panel in either the Playground card style
 * or the authentic Telegram blockquote citation style.
 */
export function SourcesPanel({
  text,
  sources,
  retrieval,
  activeIndex,
  onSelect,
  variant = "playground",
}: {
  text: string;
  sources: CitationSource[];
  retrieval?: RetrievalMode;
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
  variant?: "playground" | "telegram";
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { cited, ordered } = React.useMemo(() => orderSourcesByCitation(text, sources), [text, sources]);
  if (!ordered.length) return null;

  const limit = variant === "telegram" ? 2 : 3;
  const visible = expanded || activeIndex !== null ? ordered : ordered.slice(0, limit);
  const hiddenCount = ordered.length - visible.length;

  const scoreText = (s: CitationSource) => {
    if (s.retrieval === "agent") return "Direct";
    if (s.retrieval === "overview" || s.score < 0.15) return "Doc";
    if (s.score > 0 && s.score <= 1) return `${Math.round(s.score * 100)}%`;
    return "Match";
  };

  if (variant === "telegram") {
    return (
      <section className="rn-tg-sources" aria-label="Sources and citations">
        <div className="rn-tg-sources-head">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3 shrink-0" aria-hidden />
            Sources &amp; Citations ({ordered.length})
          </span>
          {cited.length > 0 && <span className="text-[10px] opacity-85">{cited.length} cited</span>}
        </div>
        <ol className="rn-tg-sources-list">
          {visible.map((s) => {
            const active = activeIndex === s.index;
            return (
              <li
                key={`${s.index}-${s.document}`}
                className="rn-tg-source-item"
                data-active={active ? "true" : undefined}
                onClick={() => onSelect(active ? null : s.index)}
              >
                <div className="rn-tg-source-row">
                  <span className="rn-tg-source-badge">[{s.index}]</span>
                  <span className="rn-tg-source-name" title={s.document}>
                    {s.sourceUrl && /^https:\/\//i.test(s.sourceUrl) ? (
                      <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.document}
                      </a>
                    ) : (
                      s.document
                    )}
                  </span>
                  <span className="rn-tg-source-meta">
                    {s.collection} &bull; {scoreText(s)}
                  </span>
                </div>
                {s.excerpt && <p className="rn-tg-source-quote">&ldquo;{s.excerpt}&rdquo;</p>}
              </li>
            );
          })}
        </ol>
        {ordered.length > limit && (
          <button type="button" className="rn-sources-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Show fewer sources" : `Show ${hiddenCount} more ${hiddenCount === 1 ? "source" : "sources"}`}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rn-sources-box" aria-label="Sources and citations">
      <div className="rn-sources-head">
        <span className="rn-sources-title">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          Sources &amp; Citations
          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-foreground">{ordered.length}</span>
        </span>
        <span className="rn-sources-mode">
          <Sparkles className="size-3 shrink-0" aria-hidden />
          {MODE_LABELS[retrieval ?? ordered[0]?.retrieval ?? "hybrid"]}
        </span>
      </div>
      <ol className="rn-sources-list">
        {visible.map((s) => {
          const active = activeIndex === s.index;
          const isCited = cited.includes(s.index);
          return (
            <li
              key={`${s.index}-${s.document}`}
              className="rn-source-card"
              data-active={active ? "true" : undefined}
              onClick={() => onSelect(active ? null : s.index)}
            >
              <div className="rn-source-top">
                <span className="rn-source-num">[{s.index}]</span>
                <span className="rn-source-doc" title={s.document}>
                  {s.sourceUrl && /^https:\/\//i.test(s.sourceUrl) ? (
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.document}
                      <ExternalLink className="size-3 shrink-0 opacity-75" aria-hidden />
                    </a>
                  ) : (
                    s.document
                  )}
                </span>
                {s.collection && <span className="rn-source-tag">{s.collection}</span>}
                <span className="rn-source-score">{isCited ? `Cited · ${scoreText(s)}` : scoreText(s)}</span>
              </div>
              {s.excerpt && <p className="rn-source-excerpt">{s.excerpt}</p>}
            </li>
          );
        })}
      </ol>
      {ordered.length > limit && (
        <button type="button" className="rn-sources-toggle inline-flex items-center gap-1" onClick={() => setExpanded((e) => !e)}>
          {expanded ? (
            <>
              <ChevronUp className="size-3" aria-hidden /> Show fewer sources
            </>
          ) : (
            <>
              <ChevronDown className="size-3" aria-hidden /> Show {hiddenCount} more {hiddenCount === 1 ? "source" : "sources"}
            </>
          )}
        </button>
      )}
    </section>
  );
}
