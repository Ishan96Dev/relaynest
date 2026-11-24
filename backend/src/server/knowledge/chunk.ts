/** Splits text into overlapping, paragraph-aware chunks sized for embedding and for a chat prompt. */
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

function hardSplit(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Breaks one paragraph that is longer than `size` into sentence-sized pieces. */
function splitLong(p: string, size: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of p.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > size) {
      if (cur) { out.push(cur); cur = ""; }
      out.push(...hardSplit(sentence, size));
    } else if (cur && cur.length + 1 + sentence.length > size) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** The last `n` characters of a chunk, cut at a word boundary, used to carry context into the next chunk. */
function tail(s: string, n: number): string {
  if (s.length <= n) return s;
  const t = s.slice(-n);
  const space = t.indexOf(" ");
  return space > 0 && space < n / 2 ? t.slice(space + 1) : t;
}

export function chunkText(input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = input.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const pieces = clean.split(/\n\n/).flatMap((p) => (p.length > size ? splitLong(p, size) : [p])).filter((p) => p.trim());
  const chunks: string[] = [];
  let cur = "";
  for (const piece of pieces) {
    if (cur && cur.length + 2 + piece.length > size) {
      chunks.push(cur);
      const carry = overlap > 0 ? tail(cur, overlap) : "";
      cur = carry && carry.length + 2 + piece.length <= size ? `${carry}\n\n${piece}` : piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.map((c) => c.trim()).filter(Boolean);
}
