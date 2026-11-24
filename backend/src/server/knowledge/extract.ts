import { assertSafeOutboundUrl } from "../workflow-engine/ssrf";

/** A readable problem with a document. The message is safe to show to the user. */
export class KnowledgeError extends Error {}

export type DocKind = "pdf" | "txt" | "md" | "url";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 400_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function kindFromFilename(name: string): DocKind | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "txt") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  return null;
}

export async function extractFileText(kind: Exclude<DocKind, "url">, bytes: Uint8Array): Promise<string> {
  if (kind === "pdf") {
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new KnowledgeError("This file is not a valid PDF.");
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      return (Array.isArray(text) ? text.join("\n\n") : text).slice(0, MAX_TEXT_CHARS);
    } catch (e) {
      if (e instanceof KnowledgeError) throw e;
      throw new KnowledgeError("The PDF could not be read. It may be encrypted or damaged.");
    }
  }
  if (bytes.includes(0)) throw new KnowledgeError("This file looks binary, not text.");
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "").slice(0, MAX_TEXT_CHARS);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "..." };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const text = decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|nav|footer|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|ul|ol|table)>/gi, "\n\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  return { title, text };
}

/** Downloads a public web page as text. HTTPS only, public hosts only, redirects are re-checked, body is capped. */
export async function fetchPageText(raw: string): Promise<{ title: string; text: string }> {
  let url: URL;
  try { url = assertSafeOutboundUrl(raw); } catch (e) { throw new KnowledgeError((e as Error).message || "This URL is not allowed."); }
  let res: Response | undefined;
  for (let hop = 0; hop < 4; hop++) {
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "RelayNestBot/1.0 (+knowledge-base)", accept: "text/html,text/plain;q=0.9" } });
    } catch {
      throw new KnowledgeError("The page could not be reached.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      try { url = assertSafeOutboundUrl(new URL(res.headers.get("location")!, url).toString()); } catch { throw new KnowledgeError("The page redirects somewhere that is not allowed."); }
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new KnowledgeError(`The page answered with an error${res ? ` (${res.status})` : ""}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)|application\/xhtml/i.test(type)) throw new KnowledgeError("Only HTML or plain text pages can be added.");
  const reader = res.body?.getReader();
  if (!reader) throw new KnowledgeError("The page was empty.");
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => undefined);
  const html = new TextDecoder("utf-8").decode(Buffer.concat(parts));
  if (/text\/plain/i.test(type)) return { title: url.hostname, text: html.slice(0, MAX_TEXT_CHARS) };
  const { title, text } = htmlToText(html);
  return { title: title || url.hostname, text: text.slice(0, MAX_TEXT_CHARS) };
}
