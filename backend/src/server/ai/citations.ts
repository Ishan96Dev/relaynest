/**
 * Shared RAG citation types, inline marker parsing, and Telegram HTML/plain formatters.
 * Kept pure (no server-only imports) so both backend services and frontend components can use it.
 */

export type RetrievalMode = "vector" | "keyword" | "hybrid" | "overview" | "agent" | "none";

export interface CitationSource {
  /** 1-based citation number referenced inline as [1], [2], ... */
  index: number;
  document: string;
  collection: string;
  excerpt: string;
  score: number;
  retrieval: Exclude<RetrievalMode, "none">;
  sourceUrl?: string | null;
  chunkPosition?: number;
}

/** Creates a compact single-line excerpt for source cards and Telegram citation blocks. */
export function makeExcerpt(text: string, maxLen = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const space = cut.lastIndexOf(" ");
  return `${space > maxLen * 0.6 ? cut.slice(0, space) : cut}...`;
}

/** Extracts valid unique 1-based citation numbers like [1], [2], [1, 2] from a reply in order of first appearance. */
export function extractCitedIndices(text: string, maxIndex: number): number[] {
  if (maxIndex <= 0) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    for (const part of m[1]!.split(",")) {
      const n = Number.parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= maxIndex && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * Orders sources so those cited inline appear first (keeping original 1-based indices intact).
 * If the model omitted inline numbers, still returns the grounded sources so citations are never lost.
 */
export function orderSourcesByCitation(text: string, sources: CitationSource[]): { cited: number[]; ordered: CitationSource[] } {
  const cited = extractCitedIndices(text, sources.length);
  if (!cited.length) return { cited: [], ordered: sources };
  const citedSet = new Set(cited);
  const byIdx = new Map(sources.map((s) => [s.index, s]));
  const primary = cited.map((n) => byIdx.get(n)).filter((s): s is CitationSource => Boolean(s));
  const rest = sources.filter((s) => !citedSet.has(s.index));
  return { cited, ordered: [...primary, ...rest] };
}

export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Converts simple LLM markdown (**bold**, `code`, headings) and inline [1] citations to valid Telegram HTML. */
function markdownToTelegramHtml(text: string, validIndices: Set<number>): string {
  // Preserve inline code spans first so asterisks inside code are untouched.
  const codeSlots: string[] = [];
  let work = text.replace(/`([^`\n]{1,200})`/g, (_m, code: string) => {
    const idx = codeSlots.push(`<code>${escapeTelegramHtml(code)}</code>`) - 1;
    return `\u0000CODE${idx}\u0000`;
  });

  work = escapeTelegramHtml(work);

  // Convert Markdown headings (### Heading) into bold lines.
  work = work.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  // Convert **bold** into <b>bold</b>.
  work = work.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
  // Highlight inline citations like [1] or [1, 2] as styled Telegram code badges when they refer to real sources.
  if (validIndices.size > 0) {
    work = work.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (full, inner: string) => {
      const nums = inner.split(",").map((x) => Number.parseInt(x.trim(), 10));
      if (nums.every((n) => validIndices.has(n))) {
        return nums.map((n) => `<code>[${n}]</code>`).join(" ");
      }
      return full;
    });
  }

  work = work.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => codeSlots[Number(i)] ?? "");
  return work;
}

function formatScoreBadge(s: CitationSource): string {
  if (s.retrieval === "agent") return "Agent Knowledge";
  if (s.retrieval === "overview" || s.score < 0.15) return "Document";
  if (s.score > 0 && s.score <= 1) return `${Math.round(s.score * 100)}% match`;
  return s.retrieval === "hybrid" ? "Hybrid match" : s.retrieval === "vector" ? "Vector match" : "Keyword match";
}

/**
 * Formats an assistant reply + citations into rich Telegram HTML using native <blockquote> styling
 * and inline <code>[n]</code> citation badges, staying safely under Telegram's 4096-character limit.
 */
export function formatTelegramHtmlReply(text: string, sources: CitationSource[]): string {
  const { ordered } = orderSourcesByCitation(text, sources);
  const shown = ordered.slice(0, 5);
  const validIndices = new Set(sources.map((s) => s.index));

  let footer = "";
  if (shown.length > 0) {
    const items = shown.map((s) => {
      const safeTitle = escapeTelegramHtml(s.document);
      const titleHtml =
        s.sourceUrl && /^https:\/\//i.test(s.sourceUrl)
          ? `<a href="${escapeAttr(s.sourceUrl)}">${safeTitle}</a>`
          : `<b>${safeTitle}</b>`;
      const metaParts = [s.collection && s.collection !== s.document ? escapeTelegramHtml(s.collection) : "", formatScoreBadge(s)].filter(Boolean);
      const meta = metaParts.length ? ` <i>(${metaParts.join(" · ")})</i>` : "";
      const snippet = s.excerpt ? `\n<i>“${escapeTelegramHtml(makeExcerpt(s.excerpt, 110))}”</i>` : "";
      return `<code>[${s.index}]</code> ${titleHtml}${meta}${snippet}`;
    });
    const tag = shown.length > 2 ? "blockquote expandable" : "blockquote";
    footer = `\n\n<b>📚 Sources &amp; Citations</b>\n<${tag}>${items.join("\n")}</${tag.split(" ")[0]}>`;
  }

  const maxBodyLen = Math.max(400, 3950 - footer.length);
  const trimmedBody = text.length > maxBodyLen ? `${text.slice(0, maxBodyLen - 3)}...` : text;
  const htmlBody = markdownToTelegramHtml(trimmedBody, validIndices);

  const combined = `${htmlBody}${footer}`;
  if (combined.length <= 4090) return combined;
  // Re-trim raw text conservatively if HTML entities expanded length.
  const overflow = combined.length - 4050;
  const shorter = trimmedBody.slice(0, Math.max(200, trimmedBody.length - overflow)) + "...";
  return `${markdownToTelegramHtml(shorter, validIndices)}${footer}`;
}

/** Clean plain-text fallback with numbered Sources & Citations for Telegram when HTML send fails. */
export function formatTelegramPlainReply(text: string, sources: CitationSource[]): string {
  const { ordered } = orderSourcesByCitation(text, sources);
  const shown = ordered.slice(0, 5);
  if (!shown.length) return text.length > 4000 ? `${text.slice(0, 3990)}...` : text;
  const footer =
    "\n\nSources & Citations:\n" +
    shown
      .map((s) => `[${s.index}] ${s.document}${s.collection && s.collection !== s.document ? ` (${s.collection})` : ""}${s.sourceUrl ? ` — ${s.sourceUrl}` : ""}`)
      .join("\n");
  const room = Math.max(400, 3990 - footer.length);
  const body = text.length > room ? `${text.slice(0, room - 3)}...` : text;
  return `${body}${footer}`;
}
