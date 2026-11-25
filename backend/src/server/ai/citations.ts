/**
 * Shared RAG & Web Search citation types, inline marker parsing, and rich Telegram HTML/plain formatters
 * (supporting tables, fenced code blocks, hyperlinks, blockquotes, lists, videos, link previews, and multi-chunk splitting).
 * Kept pure (no server-only imports) so both backend services and frontend components can use it.
 */

export type RetrievalMode = "vector" | "keyword" | "hybrid" | "overview" | "agent" | "web" | "none";

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

export interface TelegramMediaLinks {
  videos?: Array<{
    title: string;
    url: string;
    channel?: string;
    duration?: string;
    source?: string;
  }>;
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

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"]+$/i.test(url.trim());
}

/** Splits one pipe-delimited Markdown table row into trimmed cells. */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"));
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!trimmed.includes("-")) return false;
  const cells = trimmed.split("|").map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** Renders a parsed Markdown table as an aligned monospace `<pre>` table suitable for Telegram mobile screens. */
function renderTelegramTable(headerCells: string[], bodyRows: string[][]): string {
  const colCount = Math.max(headerCells.length, ...bodyRows.map((r) => r.length));
  if (colCount === 0) return "";
  // Cap per-column width so multi-column tables stay crisp on Telegram mobile screens.
  const maxColWidth = colCount <= 2 ? 26 : colCount === 3 ? 18 : 14;
  const clip = (v: string) => (v.length > maxColWidth ? `${v.slice(0, maxColWidth - 1)}…` : v);

  const normHeader = Array.from({ length: colCount }, (_, i) => clip(headerCells[i] ?? ""));
  const normBody = bodyRows.map((r) => Array.from({ length: colCount }, (_, i) => clip(r[i] ?? "")));

  const widths = Array.from({ length: colCount }, (_, c) =>
    Math.max(normHeader[c]!.length, ...normBody.map((r) => r[c]!.length), 3),
  );

  const fmtRow = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!, " ")).join(" │ ");
  const divider = widths.map((w) => "─".repeat(w)).join("─┼─");
  const lines = [fmtRow(normHeader), divider, ...normBody.map(fmtRow)];
  return `<pre>${escapeTelegramHtml(lines.join("\n"))}</pre>`;
}

/** Converts inline Markdown (links, inline code, bold, italic, strike, bare URLs, [n] citations) to Telegram HTML. */
function formatInlineTelegramHtml(raw: string, validIndices: Set<number>): string {
  const slots: string[] = [];
  const stash = (html: string) => {
    const idx = slots.push(html) - 1;
    return `\u0000INL${idx}\u0000`;
  };

  // 1. Preserve inline code spans first so formatting chars inside code stay untouched.
  let work = raw.replace(/`([^`\n]{1,300})`/g, (_m, code: string) => stash(`<code>${escapeTelegramHtml(code)}</code>`));

  // 2. Preserve Markdown hyperlinks [label](https://...) safely (rejecting javascript:/data: schemes).
  work = work.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,1000})\)/g, (full, label: string, url: string) => {
    if (!isSafeHttpUrl(url)) return full;
    return stash(`<a href="${escapeAttr(url.trim())}">${escapeTelegramHtml(label)}</a>`);
  });

  // 3. Auto-link bare https:// or http:// URLs outside existing slots.
  work = work.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)(?=$|[\s),.!?;:])/g, (_m, lead: string, url: string) => {
    const cleanUrl = url.replace(/[.,;:!?]+$/, "");
    const trailing = url.slice(cleanUrl.length);
    if (!isSafeHttpUrl(cleanUrl)) return `${lead}${url}`;
    const display = cleanUrl.replace(/^https?:\/\/(?:www\.)?/i, "");
    const label = display.length > 48 ? `${display.slice(0, 45)}...` : display;
    return `${lead}${stash(`<a href="${escapeAttr(cleanUrl)}">${escapeTelegramHtml(label)}</a>`)}${trailing}`;
  });

  // 4. Escape raw HTML entities in remaining text.
  work = escapeTelegramHtml(work);

  // 5. Bold (**text** / __text__), strikethrough (~~text~~), italic (*text*).
  work = work.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
  work = work.replace(/__([^_\n]+?)__/g, "<b>$1</b>");
  work = work.replace(/~~([^~\n]+?)~~/g, "<s>$1</s>");
  work = work.replace(/(^|[\s([{"'])\*([^*\n]+?)\*(?=$|[\s.,!?;:)\]}"'])/g, "$1<i>$2</i>");

  // 6. Highlight inline citations like [1] or [1, 2] as styled Telegram code badges when they refer to real sources.
  if (validIndices.size > 0) {
    work = work.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (full, inner: string) => {
      const nums = inner.split(",").map((x) => Number.parseInt(x.trim(), 10));
      if (nums.every((n) => validIndices.has(n))) {
        return nums.map((n) => `<code>[${n}]</code>`).join(" ");
      }
      return full;
    });
  }

  return work.replace(/\u0000INL(\d+)\u0000/g, (_m, i: string) => slots[Number(i)] ?? "");
}

/**
 * Converts full LLM Markdown (fenced code blocks, tables, headings, blockquotes, lists, hyperlinks,
 * bold/italic/strike, inline code, and [1] citations) into valid Telegram HTML blocks.
 */
export function markdownToTelegramBlocks(text: string, validIndices: Set<number>): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Blank line — skip extra spacing (blocks are joined cleanly with newlines).
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 1. Fenced code block ```lang ... ```
    const fenceMatch = /^```([a-zA-Z0-9_+#.-]{0,24})\s*$/.exec(line.trim());
    if (fenceMatch) {
      const lang = fenceMatch[1]!.toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing ```
      const escaped = escapeTelegramHtml(codeLines.join("\n"));
      blocks.push(lang ? `<pre><code class="language-${escapeAttr(lang)}">${escaped}</code></pre>` : `<pre>${escaped}</pre>`);
      continue;
    }

    // 2. Markdown table (header row + separator row + 1+ body rows)
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const header = splitTableRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
        body.push(splitTableRow(lines[i]!));
        i += 1;
      }
      const rendered = renderTelegramTable(header, body);
      if (rendered) blocks.push(rendered);
      continue;
    }

    // 3. Blockquote (> ...)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const inner = quoteLines.map((q) => formatInlineTelegramHtml(q, validIndices)).join("\n");
      blocks.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    // 4. Horizontal rule (--- / ***)
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push("────────────────────");
      i += 1;
      continue;
    }

    // 5. Markdown heading (# .. ######)
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const content = formatInlineTelegramHtml(headingMatch[2]!.trim(), validIndices);
      blocks.push(level <= 2 ? `<b>${content}</b>` : `<b>▸ ${content}</b>`);
      i += 1;
      continue;
    }

    // 6. Bullet or numbered list block
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        const cur = lines[i]!;
        const numMatch = /^\s*(\d+[.)])\s+(.*)$/.exec(cur);
        if (numMatch) {
          listLines.push(`<b>${numMatch[1]}</b> ${formatInlineTelegramHtml(numMatch[2]!, validIndices)}`);
        } else {
          const content = cur.replace(/^\s*[-*•]\s+/, "");
          listLines.push(`• ${formatInlineTelegramHtml(content, validIndices)}`);
        }
        i += 1;
      }
      blocks.push(listLines.join("\n"));
      continue;
    }

    // 7. Standard paragraph (consecutive non-special text lines)
    const paraLines: string[] = [];
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
      paraLines.push(formatInlineTelegramHtml(lines[i]!, validIndices));
      i += 1;
    }
    if (paraLines.length) blocks.push(paraLines.join("\n"));
  }

  return blocks;
}

function formatScoreBadge(s: CitationSource): string {
  if (s.retrieval === "web") return "Web";
  if (s.retrieval === "agent") return "Agent Knowledge";
  if (s.retrieval === "overview" || s.score < 0.15) return "Document";
  if (s.score > 0 && s.score <= 1) return `${Math.round(s.score * 100)}% match`;
  return s.retrieval === "hybrid" ? "Hybrid match" : s.retrieval === "vector" ? "Vector match" : "Keyword match";
}

function buildVideosHtmlBlock(media?: TelegramMediaLinks): string {
  const vids = (media?.videos ?? []).filter((v) => isSafeHttpUrl(v.url)).slice(0, 4);
  if (!vids.length) return "";
  const items = vids.map((v) => {
    const meta = [v.channel, v.duration, v.source].filter((x): x is string => Boolean(x)).map(escapeTelegramHtml).join(" · ");
    return `▶ <a href="${escapeAttr(v.url)}">${escapeTelegramHtml(v.title)}</a>${meta ? ` <i>(${meta})</i>` : ""}`;
  });
  return `<b>🎬 Related Videos</b>\n${items.join("\n")}`;
}

function buildSourcesHtmlBlock(text: string, sources: CitationSource[]): string {
  const { ordered } = orderSourcesByCitation(text, sources);
  const shown = ordered.slice(0, 6);
  if (!shown.length) return "";
  const items = shown.map((s) => {
    const safeTitle = escapeTelegramHtml(s.document);
    const titleHtml =
      s.sourceUrl && isSafeHttpUrl(s.sourceUrl)
        ? `<a href="${escapeAttr(s.sourceUrl)}">${safeTitle}</a>`
        : `<b>${safeTitle}</b>`;
    const metaParts = [s.collection && s.collection !== s.document ? escapeTelegramHtml(s.collection) : "", formatScoreBadge(s)].filter(Boolean);
    const meta = metaParts.length ? ` <i>(${metaParts.join(" · ")})</i>` : "";
    const snippet = s.excerpt ? `\n<i>“${escapeTelegramHtml(makeExcerpt(s.excerpt, 110))}”</i>` : "";
    return `<code>[${s.index}]</code> ${titleHtml}${meta}${snippet}`;
  });
  const tag = shown.length > 2 ? "blockquote expandable" : "blockquote";
  return `<b>📚 Sources &amp; Citations</b>\n<${tag}>${items.join("\n")}</${tag.split(" ")[0]}>`;
}

/** Splits an oversized single block (like a giant code block) safely under maxLen while keeping HTML tags closed. */
function splitSingleBlock(block: string, maxLen: number): string[] {
  if (block.length <= maxLen) return [block];
  // Check if it's a <pre>...</pre> or <pre><code ...>...</code></pre> block.
  const preCode = /^<pre>(<code[^>]*>)([\s\S]*)<\/code><\/pre>$/.exec(block);
  if (preCode) {
    const [, openCode, inner] = preCode;
    const budget = Math.max(200, maxLen - openCode!.length - 30);
    const chunks: string[] = [];
    let cur = "";
    for (const ln of inner!.split("\n")) {
      if (cur && cur.length + ln.length + 1 > budget) {
        chunks.push(`<pre>${openCode}${cur}</code></pre>`);
        cur = ln;
      } else {
        cur = cur ? `${cur}\n${ln}` : ln;
      }
    }
    if (cur) chunks.push(`<pre>${openCode}${cur}</code></pre>`);
    return chunks;
  }
  const preOnly = /^<pre>([\s\S]*)<\/pre>$/.exec(block);
  if (preOnly) {
    const inner = preOnly[1]!;
    const budget = Math.max(200, maxLen - 20);
    const chunks: string[] = [];
    let cur = "";
    for (const ln of inner.split("\n")) {
      if (cur && cur.length + ln.length + 1 > budget) {
        chunks.push(`<pre>${cur}</pre>`);
        cur = ln;
      } else {
        cur = cur ? `${cur}\n${ln}` : ln;
      }
    }
    if (cur) chunks.push(`<pre>${cur}</pre>`);
    return chunks;
  }
  // Fallback line-based split for huge paragraphs/lists (never cuts mid-tag).
  const chunks: string[] = [];
  let cur = "";
  for (const ln of block.split("\n")) {
    if (cur && cur.length + ln.length + 1 > maxLen) {
      chunks.push(cur);
      cur = ln;
    } else {
      cur = cur ? `${cur}\n${ln}` : ln;
    }
  }
  if (cur) chunks.push(cur.slice(0, maxLen));
  return chunks;
}

/**
 * Formats an assistant reply + optional videos + citations into one or more valid Telegram HTML messages,
 * splitting cleanly at block boundaries so detailed replies (>4000 chars) are never truncated mid-sentence
 * and never break open HTML tags.
 */
export function formatTelegramHtmlChunks(
  text: string,
  sources: CitationSource[],
  media?: TelegramMediaLinks,
  maxChunkLen = 3950,
): string[] {
  const validIndices = new Set(sources.map((s) => s.index));
  const bodyBlocks = markdownToTelegramBlocks(text, validIndices);
  const videoBlock = buildVideosHtmlBlock(media);
  const sourcesBlock = buildSourcesHtmlBlock(text, sources);
  const allBlocks = [...bodyBlocks, ...(videoBlock ? [videoBlock] : []), ...(sourcesBlock ? [sourcesBlock] : [])];

  if (!allBlocks.length) return [escapeTelegramHtml(text.slice(0, maxChunkLen))];

  const chunks: string[] = [];
  let current = "";
  for (const block of allBlocks) {
    const pieces = block.length > maxChunkLen ? splitSingleBlock(block, maxChunkLen) : [block];
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length <= maxChunkLen) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 4);
}

/**
 * Formats an assistant reply + citations into a single rich Telegram HTML message (<= 4096 chars).
 * Preserved for compact replies and backward compatibility; use `formatTelegramHtmlChunks` for multi-part detailed replies.
 */
export function formatTelegramHtmlReply(text: string, sources: CitationSource[], media?: TelegramMediaLinks): string {
  const validIndices = new Set(sources.map((s) => s.index));
  const videoBlock = buildVideosHtmlBlock(media);
  const sourcesBlock = buildSourcesHtmlBlock(text, sources);
  const footerParts = [videoBlock, sourcesBlock].filter(Boolean);
  const footer = footerParts.length ? `\n\n${footerParts.join("\n\n")}` : "";

  const maxBodyLen = Math.max(400, 3950 - footer.length);
  const trimmedBody = text.length > maxBodyLen ? `${text.slice(0, maxBodyLen - 3)}...` : text;
  const htmlBody = markdownToTelegramBlocks(trimmedBody, validIndices).join("\n\n");

  const combined = `${htmlBody}${footer}`;
  if (combined.length <= 4090) return combined;
  const overflow = combined.length - 4040;
  const shorter = trimmedBody.slice(0, Math.max(200, trimmedBody.length - overflow)) + "...";
  return `${markdownToTelegramBlocks(shorter, validIndices).join("\n\n")}${footer}`;
}

/** Clean plain-text fallback chunks with numbered Sources & Citations for Telegram when HTML send fails. */
export function formatTelegramPlainChunks(text: string, sources: CitationSource[], media?: TelegramMediaLinks, maxChunkLen = 3950): string[] {
  const { ordered } = orderSourcesByCitation(text, sources);
  const shown = ordered.slice(0, 6);
  const parts = [text.trim()];
  if (media?.videos?.length) {
    parts.push(
      "Related Videos:\n" +
        media.videos
          .slice(0, 4)
          .map((v) => `- ${v.title}${v.duration ? ` (${v.duration})` : ""} — ${v.url}`)
          .join("\n"),
    );
  }
  if (shown.length) {
    parts.push(
      "Sources & Citations:\n" +
        shown
          .map((s) => `[${s.index}] ${s.document}${s.collection && s.collection !== s.document ? ` (${s.collection})` : ""}${s.sourceUrl ? ` — ${s.sourceUrl}` : ""}`)
          .join("\n"),
    );
  }
  const full = parts.filter(Boolean).join("\n\n");
  if (full.length <= maxChunkLen) return [full];

  const chunks: string[] = [];
  let cur = "";
  for (const para of full.split("\n\n")) {
    if (cur && cur.length + para.length + 2 > maxChunkLen) {
      chunks.push(cur);
      cur = para.length > maxChunkLen ? `${para.slice(0, maxChunkLen - 3)}...` : para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, 4);
}

/** Single-message plain-text fallback with numbered Sources & Citations for Telegram. */
export function formatTelegramPlainReply(text: string, sources: CitationSource[], media?: TelegramMediaLinks): string {
  const { ordered } = orderSourcesByCitation(text, sources);
  const shown = ordered.slice(0, 5);
  const vidText = media?.videos?.length
    ? "\n\nRelated Videos:\n" + media.videos.slice(0, 3).map((v) => `- ${v.title} — ${v.url}`).join("\n")
    : "";
  if (!shown.length && !vidText) return text.length > 4000 ? `${text.slice(0, 3990)}...` : text;
  const footer =
    vidText +
    (shown.length
      ? "\n\nSources & Citations:\n" +
        shown
          .map((s) => `[${s.index}] ${s.document}${s.collection && s.collection !== s.document ? ` (${s.collection})` : ""}${s.sourceUrl ? ` — ${s.sourceUrl}` : ""}`)
          .join("\n")
      : "");
  const room = Math.max(400, 3990 - footer.length);
  const body = text.length > room ? `${text.slice(0, room - 3)}...` : text;
  return `${body}${footer}`;
}

/** Picks the best public URL for Telegram's rich `link_preview_options` card (top video or top web source or first link in text). */
export function pickFeaturedLinkPreviewUrl(
  text: string,
  sources: CitationSource[],
  media?: TelegramMediaLinks,
): string | undefined {
  const firstVideo = media?.videos?.find((v) => isSafeHttpUrl(v.url))?.url;
  if (firstVideo) return firstVideo;
  const firstSource = sources.find((s) => s.sourceUrl && isSafeHttpUrl(s.sourceUrl))?.sourceUrl;
  if (firstSource) return firstSource;
  const mdLink = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/.exec(text)?.[1];
  if (mdLink && isSafeHttpUrl(mdLink)) return mdLink;
  const bare = /https?:\/\/[^\s<>()]+/.exec(text)?.[0]?.replace(/[.,;:!?]+$/, "");
  if (bare && isSafeHttpUrl(bare)) return bare;
  return undefined;
}
