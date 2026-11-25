const STOP = new Set(
  "the and for are but not you your with that this from have has had was were what when where which who how why can could would should will shall about into than then them they their there here our out use used using does did doing any all more most some such only own same too very just also its it's i'm you're don't tell give please show explain".split(" "),
);

const OVERVIEW_RE =
  /\b(summar(?:y|ize|ise)|overview|brief|gist|highlights?|key\s+points?|main\s+points?|about\s+(?:this|the)\s+(?:doc|document|file|pdf|page|profile|knowledge|source)|what(?:'s|\s+is)\s+(?:in|inside|this)|describe\s+(?:the|this)|list\s+all|everything\s+(?:about|in)|who\s+is\s+(?:this|the)\s+person|entire\s+(?:doc|document|file))\b/i;

/** Turns a question into an OR query of plain words. Only letters and digits survive, so it is safe for to_tsquery. */
export function keywordQuery(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && w.length <= 40 && !STOP.has(w));
  return [...new Set(words)].slice(0, 24).join(" | ");
}

/** Extracts normalized non-stopword search terms (including 2-char tokens like AI, HR, QA, BE). */
export function extractTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && w.length <= 40 && !STOP.has(w));
  return [...new Set(words)].slice(0, 24);
}

/** True when the user asks a broad overview/summary question over the uploaded knowledge rather than a narrow lookup. */
export function isOverviewQuery(text: string): boolean {
  return OVERVIEW_RE.test(text);
}

/**
 * Lightweight lexical match score in [0, 1] supporting substring/prefix stemming and document-title hits
 * (covers inflections like experience/experiences or filename queries like "Profile.pdf" that Postgres 'simple' misses).
 */
export function lexicalScore(terms: string[], content: string, docName = ""): number {
  if (!terms.length) return 0;
  const hay = content.toLowerCase();
  const title = docName.toLowerCase();
  let matched = 0;
  for (const t of terms) {
    const stem = t.length >= 5 ? t.slice(0, -1) : t;
    if (hay.includes(t) || (stem.length >= 4 && hay.includes(stem))) {
      matched += 1;
    } else if (title.includes(t)) {
      matched += 0.85;
    }
  }
  return Math.min(1, matched / terms.length);
}
