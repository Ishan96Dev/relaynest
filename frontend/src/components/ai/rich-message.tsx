"use client";
import { Check, Copy, ExternalLink } from "lucide-react";
import * as React from "react";
import type { CitationSource } from "@backend/server/ai/citations";

function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"]+$/i.test(url.trim());
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!trimmed.includes("-")) return false;
  const cells = trimmed.split("|").map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function CodeBlock({ code, lang, variant }: { code: string; lang: string; variant: "playground" | "telegram" }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard denial
    }
  }

  return (
    <div className={variant === "telegram" ? "rn-code-block rn-code-block-tg" : "rn-code-block"}>
      <div className="rn-code-head">
        <span className="rn-code-lang">{lang || "code"}</span>
        <button type="button" className="rn-code-copy" onClick={copy} aria-label="Copy code">
          {copied ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="rn-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renders inline Markdown safely: `code`, [label](https://...), bare https:// URLs,
 * **bold**, *italic*, ~~strike~~, and interactive [1] / [1, 2] citation chips.
 */
function renderInline(
  text: string,
  byIdx: Map<number, CitationSource>,
  chipClass: string,
  activeIndex: number | null,
  onSelect: (idx: number) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Combined tokenizer ordered by specificity so code & links take priority over emphasis.
  const tokenRe =
    /`([^`\n]{1,300})`|\[([^\]]{1,200})\]\((https?:\/\/[^)\s]{1,1000})\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|~~([^~\n]+?)~~|\*([^*\n]+?)\*|\b(https?:\/\/[^\s<>()]+)|\[(\d+(?:\s*,\s*\d+)*)\]/g;

  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;

    if (m[1] !== undefined) {
      out.push(
        <code key={key} className="rn-inline-code">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined && m[3] !== undefined) {
      const href = m[3].trim();
      if (isSafeUrl(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="rn-md-link">
            {m[2]}
            <ExternalLink className="inline size-2.5 shrink-0 opacity-75" aria-hidden />
          </a>,
        );
      } else {
        out.push(m[0]);
      }
    } else if (m[4] !== undefined || m[5] !== undefined) {
      out.push(
        <strong key={key} className="font-bold">
          {renderInline(m[4] ?? m[5]!, byIdx, chipClass, activeIndex, onSelect, `${key}b`)}
        </strong>,
      );
    } else if (m[6] !== undefined) {
      out.push(<del key={key} className="opacity-75">{m[6]}</del>);
    } else if (m[7] !== undefined) {
      out.push(<em key={key}>{m[7]}</em>);
    } else if (m[8] !== undefined) {
      const cleanUrl = m[8].replace(/[.,;:!?]+$/, "");
      const trailing = m[8].slice(cleanUrl.length);
      if (isSafeUrl(cleanUrl)) {
        const display = cleanUrl.replace(/^https?:\/\/(?:www\.)?/i, "");
        out.push(
          <React.Fragment key={key}>
            <a href={cleanUrl} target="_blank" rel="noopener noreferrer" className="rn-md-link">
              {display.length > 46 ? `${display.slice(0, 43)}...` : display}
              <ExternalLink className="inline size-2.5 shrink-0 opacity-75" aria-hidden />
            </a>
            {trailing}
          </React.Fragment>,
        );
      } else {
        out.push(m[0]);
      }
    } else if (m[9] !== undefined) {
      const nums = m[9].split(",").map((x) => Number.parseInt(x.trim(), 10));
      if (byIdx.size > 0 && nums.every((n) => byIdx.has(n))) {
        nums.forEach((n, j) => {
          const src = byIdx.get(n)!;
          out.push(
            <button
              key={`${key}-c${j}`}
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
      } else {
        out.push(m[0]);
      }
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Rich, zero-dependency, XSS-safe Markdown renderer for Playground and Telegram Preview:
 * tables, fenced code blocks with copy buttons, headings, lists, blockquotes, hyperlinks, and inline [n] citations.
 */
export function RichMessage({
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

  const blocks = React.useMemo(() => {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const out: React.ReactNode[] = [];
    let i = 0;
    let bKey = 0;

    while (i < lines.length) {
      const line = lines[i]!;
      if (!line.trim()) {
        i += 1;
        continue;
      }

      // 1. Fenced code block ```lang ... ```
      const fence = /^```([a-zA-Z0-9_+#.-]{0,24})\s*$/.exec(line.trim());
      if (fence) {
        const lang = fence[1]!;
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) {
          codeLines.push(lines[i]!);
          i += 1;
        }
        if (i < lines.length) i += 1;
        out.push(<CodeBlock key={`b-${bKey++}`} code={codeLines.join("\n")} lang={lang} variant={variant} />);
        continue;
      }

      // 2. Markdown table
      if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
        const headers = splitTableRow(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
          rows.push(splitTableRow(lines[i]!));
          i += 1;
        }
        const k = `b-${bKey++}`;
        out.push(
          <div key={k} className="rn-md-table-wrap">
            <table className={variant === "telegram" ? "rn-md-table rn-tg-table" : "rn-md-table"}>
              <thead>
                <tr>
                  {headers.map((h, ci) => (
                    <th key={ci}>{renderInline(h, byIdx, chipClass, activeIndex, onSelect, `${k}-h${ci}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {headers.map((_, ci) => (
                      <td key={ci}>{renderInline(r[ci] ?? "", byIdx, chipClass, activeIndex, onSelect, `${k}-r${ri}c${ci}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // 3. Blockquote (> ...)
      if (/^\s*>\s?/.test(line)) {
        const qLines: string[] = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
          qLines.push(lines[i]!.replace(/^\s*>\s?/, ""));
          i += 1;
        }
        const k = `b-${bKey++}`;
        out.push(
          <blockquote key={k} className={variant === "telegram" ? "rn-md-quote rn-md-quote-tg" : "rn-md-quote"}>
            {qLines.map((ql, qi) => (
              <p key={qi}>{renderInline(ql, byIdx, chipClass, activeIndex, onSelect, `${k}-q${qi}`)}</p>
            ))}
          </blockquote>,
        );
        continue;
      }

      // 4. Horizontal rule
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        out.push(<hr key={`b-${bKey++}`} className="rn-md-hr" />);
        i += 1;
        continue;
      }

      // 5. Headings (# .. ######)
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (heading) {
        const lvl = heading[1]!.length;
        const k = `b-${bKey++}`;
        const cls = lvl === 1 ? "rn-md-h1" : lvl === 2 ? "rn-md-h2" : "rn-md-h3";
        out.push(
          <p key={k} className={cls}>
            {renderInline(heading[2]!.trim(), byIdx, chipClass, activeIndex, onSelect, k)}
          </p>,
        );
        i += 1;
        continue;
      }

      // 6. Unordered list
      if (/^\s*[-*•]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i]!)) {
          items.push(lines[i]!.replace(/^\s*[-*•]\s+/, ""));
          i += 1;
        }
        const k = `b-${bKey++}`;
        out.push(
          <ul key={k} className="rn-md-ul">
            {items.map((it, ii) => (
              <li key={ii}>{renderInline(it, byIdx, chipClass, activeIndex, onSelect, `${k}-u${ii}`)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      // 7. Ordered list
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
          items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, ""));
          i += 1;
        }
        const k = `b-${bKey++}`;
        out.push(
          <ol key={k} className="rn-md-ol">
            {items.map((it, ii) => (
              <li key={ii}>{renderInline(it, byIdx, chipClass, activeIndex, onSelect, `${k}-o${ii}`)}</li>
            ))}
          </ol>,
        );
        continue;
      }

      // 8. Standard paragraph
      const pLines: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() !== "" &&
        !/^```/.test(lines[i]!.trim()) &&
        !/^#{1,6}\s+/.test(lines[i]!.trim()) &&
        !/^\s*>\s?/.test(lines[i]!) &&
        !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]!) &&
        !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]!) &&
        !(lines[i]!.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]!))
      ) {
        pLines.push(lines[i]!);
        i += 1;
      }
      if (pLines.length) {
        const k = `b-${bKey++}`;
        out.push(
          <p key={k} className="rn-md-p">
            {pLines.map((pl, pi) => (
              <React.Fragment key={pi}>
                {pi > 0 && <br />}
                {renderInline(pl, byIdx, chipClass, activeIndex, onSelect, `${k}-p${pi}`)}
              </React.Fragment>
            ))}
          </p>,
        );
      }
    }

    return out;
  }, [text, byIdx, chipClass, activeIndex, onSelect, variant]);

  return (
    <div className={variant === "telegram" ? "rn-md rn-md-tg" : "rn-md"}>
      {blocks}
      {streaming && <span className="rn-stream-cursor" aria-hidden />}
    </div>
  );
}
