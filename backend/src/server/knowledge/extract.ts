import { unzipSync } from "fflate";

/** A readable problem with a document. The message is safe to show to the user. */
export class KnowledgeError extends Error {}

export type DocKind = "pdf" | "docx" | "xlsx" | "csv" | "pptx" | "txt" | "md" | "json" | "html" | "url";
export type FileDocKind = Exclude<DocKind, "url">;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 400_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 35 * 1024 * 1024;
const MAX_SPREADSHEET_ROWS = 4_000;
const MAX_SPREADSHEET_COLS = 64;

const EXT_TO_KIND: Record<string, FileDocKind> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  odt: "docx",
  rtf: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  ods: "xlsx",
  csv: "csv",
  tsv: "csv",
  pptx: "pptx",
  odp: "pptx",
  txt: "txt",
  log: "txt",
  md: "md",
  markdown: "md",
  mdx: "md",
  json: "json",
  jsonl: "json",
  yaml: "json",
  yml: "json",
  xml: "json",
  html: "html",
  htm: "html",
  xhtml: "html",
};

export const SUPPORTED_FILE_EXTENSIONS = Object.keys(EXT_TO_KIND);

export function extensionFromFilename(name: string): string {
  const clean = name.trim().toLowerCase();
  const idx = clean.lastIndexOf(".");
  return idx >= 0 ? clean.slice(idx + 1) : "";
}

export function kindFromFilename(name: string): DocKind | null {
  const ext = extensionFromFilename(name);
  return EXT_TO_KIND[ext] ?? null;
}

export function kindFromContentType(contentType: string): FileDocKind | null {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/pdf")) return "pdf";
  if (ct.includes("wordprocessingml") || ct.includes("msword") || ct.includes("opendocument.text") || ct.includes("rtf")) return "docx";
  if (ct.includes("spreadsheetml") || ct.includes("ms-excel") || ct.includes("opendocument.spreadsheet")) return "xlsx";
  if (ct.includes("text/csv") || ct.includes("tab-separated-values")) return "csv";
  if (ct.includes("presentationml") || ct.includes("opendocument.presentation")) return "pptx";
  if (ct.includes("text/markdown")) return "md";
  if (ct.includes("application/json") || ct.includes("yaml") || ct.includes("application/xml") || ct.includes("text/xml")) return "json";
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  if (ct.includes("text/plain")) return "txt";
  return null;
}

// ---------- shared entity & text helpers ----------
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  times: "×",
  divide: "÷",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const hasBomUtf8 = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const slice = hasBomUtf8 ? bytes.subarray(3) : bytes;
  if (slice.includes(0)) {
    throw new KnowledgeError("This file looks binary, not plain text.");
  }
  return new TextDecoder("utf-8").decode(slice).replace(/^\uFEFF/, "");
}

function isZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
}

function isOle2Signature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

function safeUnzip(bytes: Uint8Array, label: string): Record<string, Uint8Array> {
  try {
    let total = 0;
    const files = unzipSync(bytes, {
      filter(file) {
        total += file.originalSize || 0;
        if (total > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new KnowledgeError(`This ${label} archive expands past the safety limit.`);
        }
        return true;
      },
    });
    return files;
  } catch (e) {
    if (e instanceof KnowledgeError) throw e;
    throw new KnowledgeError(`This ${label} file could not be opened. It may be corrupted or password-protected.`);
  }
}

const utf8 = new TextDecoder("utf-8");
const readZipText = (files: Record<string, Uint8Array>, path: string): string | null => {
  const exact = files[path];
  if (exact) return utf8.decode(exact);
  const lower = path.toLowerCase();
  const key = Object.keys(files).find((k) => k.toLowerCase() === lower);
  return key ? utf8.decode(files[key]!) : null;
};

// ---------- HTML ----------
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const text = decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|nav|footer|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|ul|ol|table)>/gi, "\n\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

// ---------- CSV / TSV ----------
function detectDelimiter(sample: string, ext: string): string {
  if (ext === "tsv") return "\t";
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestScore = -1;
  for (const delim of candidates) {
    const counts = lines.map((line) => {
      let inQuote = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuote = !inQuote;
        else if (ch === delim && !inQuote) count++;
      }
      return count;
    });
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) continue;
    const min = Math.min(...nonZero);
    const max = Math.max(...nonZero);
    const consistency = max > 0 ? min / max : 0;
    const score = nonZero.reduce((a, b) => a + b, 0) * (0.5 + consistency);
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

export function parseCsvRows(input: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
      if (row.length >= MAX_SPREADSHEET_COLS) {
        // Still continue reading to line end without unbounded columns.
      }
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row.slice(0, MAX_SPREADSHEET_COLS));
      row = [];
      if (rows.length >= MAX_SPREADSHEET_ROWS) break;
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0) && rows.length < MAX_SPREADSHEET_ROWS) {
      rows.push(row.slice(0, MAX_SPREADSHEET_COLS));
    }
  }
  return rows;
}

/**
 * Formats tabular rows for RAG chunking so every row keeps its column headers.
 * When a sheet is split across many chunks, each chunk stays self-describing.
 */
function formatTableForRag(rows: string[][], sheetTitle?: string): string {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (!nonEmpty.length) return "";
  const lines: string[] = [];
  if (sheetTitle) lines.push(`## Sheet: ${sheetTitle}`);

  const first = nonEmpty[0]!;
  const nonBlankHeaders = first.filter((h) => h.trim().length > 0);
  const looksLikeHeader =
    nonEmpty.length >= 2 &&
    nonBlankHeaders.length >= Math.max(1, Math.floor(first.length * 0.5)) &&
    nonBlankHeaders.every((h) => h.length <= 80 && !/^-?\d+(?:\.\d+)?$/.test(h.trim()));

  if (looksLikeHeader) {
    const headers = first.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
    lines.push(`Columns: ${headers.join(" | ")}`);
    for (let r = 1; r < nonEmpty.length; r++) {
      const cells = nonEmpty[r]!;
      const pairs: string[] = [];
      for (let c = 0; c < Math.max(headers.length, cells.length); c++) {
        const val = (cells[c] ?? "").trim();
        if (!val) continue;
        const key = headers[c] ?? `Column ${c + 1}`;
        pairs.push(`${key}: ${val}`);
      }
      if (pairs.length) lines.push(pairs.join(" | "));
    }
  } else {
    for (const r of nonEmpty) {
      const vals = r.map((c) => c.trim()).filter(Boolean);
      if (vals.length) lines.push(vals.join(" | "));
    }
  }
  return lines.join("\n");
}

function extractCsvText(bytes: Uint8Array, ext: string): string {
  const raw = decodeTextBytes(bytes);
  const delimiter = detectDelimiter(raw, ext);
  const rows = parseCsvRows(raw, delimiter);
  return formatTableForRag(rows);
}

// ---------- DOCX (OOXML WordprocessingML) ----------
function extractWordXmlParagraphs(xml: string): string {
  // Handle tables cleanly: separate cells with " | " and rows with newlines.
  const withoutDeleted = xml.replace(/<w:del\b[\s\S]*?<\/w:del>/gi, "");
  const blocks: string[] = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(withoutDeleted)) !== null) {
    const p = m[1]!;
    const parts: string[] = [];
    const tokenRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(br|cr|tab)\b[^>]*\/?>/gi;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(p)) !== null) {
      if (t[1] !== undefined) parts.push(decodeEntities(t[1]));
      else if (t[2]?.toLowerCase() === "tab") parts.push("\t");
      else parts.push("\n");
    }
    const line = parts.join("").replace(/[ \t]+/g, " ").trim();
    if (line) blocks.push(line);
  }
  return blocks.join("\n\n");
}

function extractDocxText(bytes: Uint8Array): string {
  const files = safeUnzip(bytes, "Word (.docx)");
  const sections: string[] = [];
  const headers = Object.keys(files).filter((k) => /^word\/header\d+\.xml$/i.test(k)).sort();
  for (const h of headers) {
    const txt = extractWordXmlParagraphs(utf8.decode(files[h]!));
    if (txt) sections.push(txt);
  }
  const mainXml = readZipText(files, "word/document.xml");
  if (!mainXml) throw new KnowledgeError("This Word document is missing word/document.xml.");
  const mainText = extractWordXmlParagraphs(mainXml);
  if (mainText) sections.push(mainText);
  const extras = ["word/footnotes.xml", "word/endnotes.xml"];
  for (const ex of extras) {
    const xml = readZipText(files, ex);
    if (xml) {
      const txt = extractWordXmlParagraphs(xml);
      if (txt) sections.push(txt);
    }
  }
  return sections.join("\n\n");
}

// ---------- ODT / ODS / ODP (OpenDocument Format) ----------
function extractOdfTextXml(xml: string): string {
  const blocks: string[] = [];
  const re = /<text:(?:h|p)\b[^>]*>([\s\S]*?)<\/text:(?:h|p)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeEntities(
      m[1]!
        .replace(/<text:tab\b[^>]*\/?>/gi, "\t")
        .replace(/<text:line-break\b[^>]*\/?>/gi, "\n")
        .replace(/<text:s\b[^>]*\/?>/gi, " ")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) blocks.push(text);
  }
  return blocks.join("\n\n");
}

function extractOdsText(bytes: Uint8Array): string {
  const files = safeUnzip(bytes, "OpenDocument Spreadsheet (.ods)");
  const xml = readZipText(files, "content.xml");
  if (!xml) throw new KnowledgeError("This ODS spreadsheet is missing content.xml.");
  const sheets: string[] = [];
  const tableRe = /<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(xml)) !== null) {
    const nameMatch = /table:name="([^"]*)"/i.exec(tm[1]!);
    const sheetName = decodeEntities(nameMatch?.[1] ?? `Sheet ${sheets.length + 1}`);
    const rows: string[][] = [];
    const rowRe = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tm[2]!)) !== null && rows.length < MAX_SPREADSHEET_ROWS) {
      const row: string[] = [];
      const cellRe = /<table:(?:table-cell|covered-table-cell)\b([^>]*)(?:\/>|>([\s\S]*?)<\/table:(?:table-cell|covered-table-cell)>)/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]!)) !== null && row.length < MAX_SPREADSHEET_COLS) {
        const attrs = cm[1] ?? "";
        const body = cm[2] ?? "";
        const rep = Math.min(32, Number(/table:number-columns-repeated="(\d+)"/i.exec(attrs)?.[1] ?? "1") || 1);
        const text = decodeEntities(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
        for (let r = 0; r < rep && row.length < MAX_SPREADSHEET_COLS; r++) {
          row.push(text);
        }
      }
      if (row.some((c) => c.length > 0)) rows.push(row);
    }
    const formatted = formatTableForRag(rows, sheetName);
    if (formatted) sheets.push(formatted);
  }
  return sheets.join("\n\n");
}

// ---------- RTF ----------
export function extractRtfText(raw: string): string {
  let out = "";
  let depth = 0;
  let skipDepth = -1;
  const skipGroups = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "header",
    "footer",
    "headerl",
    "headerr",
    "headerf",
    "footerl",
    "footerr",
    "footerf",
    "listtable",
    "listoverridetable",
    "rsidtbl",
    "generator",
    "themedata",
    "colorschememapping",
    "datastore",
    "latentstyles",
  ]);
  let ucSkip = 1;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "{") {
      depth++;
      i++;
      if (skipDepth === -1) {
        const lookahead = raw.slice(i, i + 32);
        if (lookahead.startsWith("\\*")) {
          skipDepth = depth;
        } else {
          const gm = /^\\([a-z]+)/i.exec(lookahead);
          if (gm && skipGroups.has(gm[1]!.toLowerCase())) {
            skipDepth = depth;
          }
        }
      }
      continue;
    }
    if (ch === "}") {
      if (skipDepth === depth) skipDepth = -1;
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (skipDepth !== -1) {
      i++;
      continue;
    }
    if (ch === "\\") {
      i++;
      const next = raw[i];
      if (!next) break;
      if (next === "\\" || next === "{" || next === "}") {
        out += next;
        i++;
      } else if (next === "~") {
        out += " ";
        i++;
      } else if (next === "-" || next === "_") {
        out += "-";
        i++;
      } else if (next === "\r" || next === "\n") {
        out += "\n";
        i++;
      } else if (next === "'") {
        const hex = raw.slice(i + 1, i + 3);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 3;
        } else {
          i++;
        }
      } else if (/[a-z]/i.test(next)) {
        const m = /^([a-z]+)(-?\d+)?[ ]?/i.exec(raw.slice(i));
        if (m) {
          const word = m[1]!.toLowerCase();
          const num = m[2] !== undefined ? parseInt(m[2], 10) : null;
          i += m[0].length;
          if (word === "par" || word === "line") out += "\n";
          else if (word === "tab" || word === "cell") out += "\t";
          else if (word === "row") out += "\n";
          else if (word === "uc" && num !== null) ucSkip = Math.max(0, num);
          else if (word === "u" && num !== null) {
            const code = num < 0 ? num + 65536 : num;
            if (code > 0 && code < 0x110000) out += String.fromCodePoint(code);
            // Skip fallback ANSI chars after \uN.
            for (let s = 0; s < ucSkip && i < raw.length; s++) {
              if (raw[i] === "\\" && raw[i + 1] === "'") i += 4;
              else if (raw[i] !== "{" && raw[i] !== "}" && raw[i] !== "\\") i++;
            }
          }
        } else {
          i++;
        }
      } else {
        i++;
      }
      continue;
    }
    if (ch !== "\r" && ch !== "\n") out += ch;
    i++;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- XLSX (OOXML SpreadsheetML) ----------
function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  // Excel 1900 epoch (with the historical Lotus 1-2-3 leap-year day offset for serial >= 60).
  const adjusted = serial >= 60 ? serial - 1 : serial;
  const ms = Date.UTC(1899, 11, 31) + Math.round(adjusted * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const hasTime = Math.abs(serial - Math.trunc(serial)) > 1e-6;
  return hasTime ? d.toISOString().replace("T", " ").slice(0, 16) : d.toISOString().slice(0, 10);
}

const BUILTIN_DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function parseXlsxDateStyles(stylesXml: string | null): Set<number> {
  const dateStyleIndices = new Set<number>();
  if (!stylesXml) return dateStyleIndices;
  const customDateIds = new Set<number>();
  const numFmtRe = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/?>/gi;
  let nm: RegExpExecArray | null;
  while ((nm = numFmtRe.exec(stylesXml)) !== null) {
    const id = Number(nm[1]);
    const code = decodeEntities(nm[2]!).replace(/"[^"]*"/g, "").toLowerCase();
    if (!code.includes("$") && !code.includes("₹") && /[ymd]/.test(code) && !/^[#0.,]+$/.test(code)) {
      customDateIds.add(id);
    }
  }
  const cellXfsBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i.exec(stylesXml)?.[1] ?? "";
  const xfRe = /<xf\b([^>]*)(?:\/>|>[\s\S]*?<\/xf>)/gi;
  let xm: RegExpExecArray | null;
  let idx = 0;
  while ((xm = xfRe.exec(cellXfsBlock)) !== null) {
    const idMatch = /numFmtId="(\d+)"/i.exec(xm[1]!);
    if (idMatch) {
      const fid = Number(idMatch[1]);
      if (BUILTIN_DATE_FMT_IDS.has(fid) || customDateIds.has(fid)) {
        dateStyleIndices.add(idx);
      }
    }
    idx++;
  }
  return dateStyleIndices;
}

function parseXlsxSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    // Strip phonetic runs (<rPh>...</rPh>) so Japanese/CJK ruby annotations don't duplicate text.
    const cleanSi = m[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/gi, "");
    const parts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(cleanSi)) !== null) {
      parts.push(decodeEntities(tm[1]!));
    }
    out.push(parts.join(""));
  }
  return out;
}

function resolveXlsxSheets(files: Record<string, Uint8Array>): Array<{ name: string; path: string }> {
  const wbXml = readZipText(files, "xl/workbook.xml");
  const relsXml = readZipText(files, "xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  if (relsXml) {
    const rRe = /<Relationship\b([^>]*)\/?>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rRe.exec(relsXml)) !== null) {
      const id = /Id="([^"]+)"/i.exec(rm[1]!)?.[1];
      const target = /Target="([^"]+)"/i.exec(rm[1]!)?.[1];
      if (id && target) {
        const normalized = target.replace(/^\/+/, "").startsWith("xl/") ? target.replace(/^\/+/, "") : `xl/${target.replace(/^\.?\//, "")}`;
        relMap.set(id, normalized);
      }
    }
  }
  const sheets: Array<{ name: string; path: string }> = [];
  if (wbXml) {
    const sRe = /<sheet\b([^>]*)\/?>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = sRe.exec(wbXml)) !== null) {
      const attrs = sm[1]!;
      const name = decodeEntities(/name="([^"]+)"/i.exec(attrs)?.[1] ?? `Sheet ${sheets.length + 1}`);
      const rId = /(?:r:)?id="([^"]+)"/i.exec(attrs)?.[1];
      const path = (rId ? relMap.get(rId) : null) ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
      sheets.push({ name, path });
    }
  }
  if (!sheets.length) {
    const fallback = Object.keys(files)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    fallback.forEach((path, i) => sheets.push({ name: `Sheet ${i + 1}`, path }));
  }
  return sheets;
}

function extractXlsxText(bytes: Uint8Array): string {
  const files = safeUnzip(bytes, "Excel (.xlsx)");
  const shared = parseXlsxSharedStrings(readZipText(files, "xl/sharedStrings.xml"));
  const dateStyles = parseXlsxDateStyles(readZipText(files, "xl/styles.xml"));
  const sheetDefs = resolveXlsxSheets(files);
  const out: string[] = [];

  for (const sheet of sheetDefs) {
    const xml = readZipText(files, sheet.path);
    if (!xml) continue;
    const rows: string[][] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(xml)) !== null && rows.length < MAX_SPREADSHEET_ROWS) {
      const row: string[] = [];
      const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi;
      let cm: RegExpExecArray | null;
      let autoCol = 0;
      while ((cm = cellRe.exec(rm[1]!)) !== null) {
        const attrs = cm[1] ?? "";
        const body = cm[2] ?? "";
        const ref = /r="([A-Z]+)\d+"/i.exec(attrs)?.[1];
        const colIdx = ref ? colLettersToIndex(ref.toUpperCase()) : autoCol;
        autoCol = colIdx + 1;
        if (colIdx >= MAX_SPREADSHEET_COLS) continue;

        const type = /t="([^"]+)"/i.exec(attrs)?.[1] ?? "";
        const styleIdx = /s="(\d+)"/i.exec(attrs)?.[1];
        let val = "";
        if (type === "inlineStr") {
          const parts: string[] = [];
          const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
          let tm: RegExpExecArray | null;
          while ((tm = tRe.exec(body)) !== null) parts.push(decodeEntities(tm[1]!));
          val = parts.join("");
        } else {
          const rawV = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1];
          if (rawV !== undefined) {
            if (type === "s") {
              val = shared[Number(rawV)] ?? "";
            } else if (type === "b") {
              val = rawV === "1" ? "TRUE" : "FALSE";
            } else if (type === "str" || type === "e") {
              val = decodeEntities(rawV);
            } else if (styleIdx !== undefined && dateStyles.has(Number(styleIdx))) {
              val = excelSerialToIsoDate(Number(rawV)) ?? rawV;
            } else {
              val = rawV;
            }
          }
        }
        while (row.length <= colIdx) row.push("");
        row[colIdx] = val.trim();
      }
      if (row.some((c) => c.length > 0)) rows.push(row);
    }
    const formatted = formatTableForRag(rows, sheet.name);
    if (formatted) out.push(formatted);
  }
  return out.join("\n\n");
}

// ---------- OLE2 Compound Document reader (for legacy .xls and .doc) ----------
function readOle2Streams(bytes: Uint8Array): Map<string, Uint8Array> {
  const streams = new Map<string, Uint8Array>();
  if (!isOle2Signature(bytes) || bytes.length < 512) return streams;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const miniShift = view.getUint16(32, true);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniShift;
  if (sectorSize !== 512 && sectorSize !== 4096) return streams;

  const firstDirSector = view.getInt32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const firstMiniFatSector = view.getInt32(60, true);
  let firstDifatSector = view.getInt32(68, true);

  const sectorOffset = (sec: number) => (sec + 1) * sectorSize;
  const readSector = (sec: number): Uint8Array | null => {
    const off = sectorOffset(sec);
    if (sec < 0 || off + sectorSize > bytes.length) return null;
    return bytes.subarray(off, off + sectorSize);
  };

  // Build FAT sector list from DIFAT (first 109 in header + chained DIFAT sectors).
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) fatSectors.push(s);
  }
  let difatGuard = 0;
  while (firstDifatSector >= 0 && difatGuard++ < 64) {
    const secBytes = readSector(firstDifatSector);
    if (!secBytes) break;
    const dv = new DataView(secBytes.buffer, secBytes.byteOffset, secBytes.byteLength);
    const count = sectorSize / 4 - 1;
    for (let i = 0; i < count; i++) {
      const s = dv.getInt32(i * 4, true);
      if (s >= 0) fatSectors.push(s);
    }
    firstDifatSector = dv.getInt32(count * 4, true);
  }

  const fat: number[] = [];
  for (const fs of fatSectors) {
    const secBytes = readSector(fs);
    if (!secBytes) continue;
    const dv = new DataView(secBytes.buffer, secBytes.byteOffset, secBytes.byteLength);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(dv.getInt32(i * 4, true));
  }

  const readChain = (start: number, maxLen?: number): Uint8Array<ArrayBuffer> => {
    const chunks: Uint8Array[] = [];
    const seen = new Set<number>();
    let cur = start;
    let total = 0;
    while (cur >= 0 && !seen.has(cur) && seen.size < 65_536) {
      seen.add(cur);
      const sec = readSector(cur);
      if (!sec) break;
      chunks.push(sec);
      total += sec.length;
      if (maxLen !== undefined && total >= maxLen) break;
      cur = fat[cur] ?? -2;
    }
    const out = new Uint8Array(maxLen !== undefined ? Math.min(total, maxLen) : total);
    let pos = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, out.length - pos);
      if (take <= 0) break;
      out.set(c.subarray(0, take), pos);
      pos += take;
    }
    return out;
  };

  // Build MiniFAT & directory stream
  const miniFat: number[] = [];
  if (firstMiniFatSector >= 0) {
    const mfBytes = readChain(firstMiniFatSector);
    const dv = new DataView(mfBytes.buffer, mfBytes.byteOffset, mfBytes.byteLength);
    for (let i = 0; i < Math.floor(mfBytes.length / 4); i++) miniFat.push(dv.getInt32(i * 4, true));
  }

  const dirBytes = readChain(firstDirSector);
  let miniStream: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  const readMiniChain = (start: number, len: number): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(len);
    const seen = new Set<number>();
    let cur = start;
    let pos = 0;
    while (cur >= 0 && !seen.has(cur) && pos < len && seen.size < 65_536) {
      seen.add(cur);
      const off = cur * miniSectorSize;
      if (off + miniSectorSize > miniStream.length) break;
      const take = Math.min(miniSectorSize, len - pos);
      out.set(miniStream.subarray(off, off + take), pos);
      pos += take;
      cur = miniFat[cur] ?? -2;
    }
    return out;
  };

  const entries: Array<{ name: string; type: number; start: number; size: number }> = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const dv = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    const nameLen = Math.min(64, dv.getUint16(64, true));
    const type = dv.getUint8(66);
    if (type === 0 || nameLen < 2) continue;
    const name = new TextDecoder("utf-16le").decode(dirBytes.subarray(off, off + nameLen - 2));
    const start = dv.getInt32(116, true);
    const size = dv.getUint32(120, true);
    entries.push({ name, type, start, size });
    if (type === 5 && start >= 0 && size > 0) {
      miniStream = readChain(start, size);
    }
  }

  for (const e of entries) {
    if (e.type !== 2 || e.start < 0 || e.size === 0) continue;
    const data = e.size < miniCutoff && miniStream.length > 0 ? readMiniChain(e.start, e.size) : readChain(e.start, e.size);
    streams.set(e.name.toLowerCase(), data);
  }
  return streams;
}

// ---------- Legacy Excel .xls (BIFF8) ----------
function decodeRkNumber(rk: number): number {
  const isMultiplied = (rk & 0x01) !== 0;
  const isInt = (rk & 0x02) !== 0;
  let val: number;
  if (isInt) {
    val = rk >> 2;
  } else {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint32(0, 0, true);
    dv.setUint32(4, rk & 0xfffffffc, true);
    val = dv.getFloat64(0, true);
  }
  return isMultiplied ? val / 100 : val;
}

function readBiff8String(buf: Uint8Array, offset: number, charCount: number): { text: string; next: number } {
  if (offset >= buf.length) return { text: "", next: offset };
  const flags = buf[offset++]!;
  const isUtf16 = (flags & 0x01) !== 0;
  const hasExtended = (flags & 0x04) !== 0;
  const hasRich = (flags & 0x08) !== 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const richRuns = hasRich && offset + 2 <= buf.length ? dv.getUint16(offset, true) : 0;
  if (hasRich) offset += 2;
  const extBytes = hasExtended && offset + 4 <= buf.length ? dv.getUint32(offset, true) : 0;
  if (hasExtended) offset += 4;
  const byteLen = isUtf16 ? charCount * 2 : charCount;
  const end = Math.min(buf.length, offset + byteLen);
  const slice = buf.subarray(offset, end);
  const text = isUtf16 ? new TextDecoder("utf-16le").decode(slice) : new TextDecoder("latin1").decode(slice);
  return { text, next: end + richRuns * 4 + extBytes };
}

function extractBiff8XlsText(bytes: Uint8Array): string {
  const streams = readOle2Streams(bytes);
  const wb = streams.get("workbook") ?? streams.get("book");
  if (!wb || wb.length < 16) throw new KnowledgeError("This .xls file could not be read. Try saving it as .xlsx or .csv.");

  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const sheetNames: string[] = [];
  const sheetOffsets: number[] = [];
  const sst: string[] = [];

  // First pass: collect BOUNDSHEET and SST (merging immediate CONTINUE records).
  let pos = 0;
  while (pos + 4 <= wb.length) {
    const recId = dv.getUint16(pos, true);
    const recLen = dv.getUint16(pos + 2, true);
    const bodyStart = pos + 4;
    const bodyEnd = Math.min(wb.length, bodyStart + recLen);
    if (recId === 0x0085 && bodyEnd >= bodyStart + 8) {
      const bofPos = dv.getUint32(bodyStart, true);
      const nameChars = wb[bodyStart + 6]!;
      const { text } = readBiff8String(wb, bodyStart + 7, nameChars);
      sheetNames.push(text || `Sheet ${sheetNames.length + 1}`);
      sheetOffsets.push(bofPos);
    } else if (recId === 0x00fc && bodyEnd >= bodyStart + 8) {
      // Collect SST + immediate CONTINUE records so strings don't truncate across record boundaries.
      const totalUnique = dv.getUint32(bodyStart + 4, true);
      const chunks: Array<{ data: Uint8Array; isContinue: boolean }> = [{ data: wb.subarray(bodyStart + 8, bodyEnd), isContinue: false }];
      let look = bodyEnd;
      while (look + 4 <= wb.length && dv.getUint16(look, true) === 0x003c) {
        const cLen = dv.getUint16(look + 2, true);
        chunks.push({ data: wb.subarray(look + 4, Math.min(wb.length, look + 4 + cLen)), isContinue: true });
        look += 4 + cLen;
      }
      let ci = 0;
      let co = 0;
      const readByte = () => {
        while (ci < chunks.length && co >= chunks[ci]!.data.length) {
          ci++;
          co = 0;
        }
        return ci < chunks.length ? chunks[ci]!.data[co++]! : -1;
      };
      const readU16 = () => {
        const a = readByte();
        const b = readByte();
        return a < 0 || b < 0 ? -1 : a | (b << 8);
      };
      const readU32 = () => {
        const a = readU16();
        const b = readU16();
        return a < 0 || b < 0 ? -1 : (a | (b << 16)) >>> 0;
      };
      for (let s = 0; s < Math.min(totalUnique, 100_000) && ci < chunks.length; s++) {
        const cch = readU16();
        const flags = readByte();
        if (cch < 0 || flags < 0) break;
        let isUtf16 = (flags & 0x01) !== 0;
        const hasExt = (flags & 0x04) !== 0;
        const hasRich = (flags & 0x08) !== 0;
        const rt = hasRich ? readU16() : 0;
        const ext = hasExt ? readU32() : 0;
        let str = "";
        let rem = cch;
        while (rem > 0 && ci < chunks.length) {
          if (co >= chunks[ci]!.data.length) {
            ci++;
            co = 0;
            if (ci >= chunks.length) break;
            // In CONTINUE records, first byte is the new encoding flag for the split string.
            const contFlag = chunks[ci]!.data[co++]!;
            isUtf16 = (contFlag & 0x01) !== 0;
          }
          const availBytes = chunks[ci]!.data.length - co;
          const stepChars = Math.min(rem, isUtf16 ? Math.floor(availBytes / 2) : availBytes);
          if (stepChars <= 0) break;
          const byteCount = isUtf16 ? stepChars * 2 : stepChars;
          const slice = chunks[ci]!.data.subarray(co, co + byteCount);
          str += isUtf16 ? new TextDecoder("utf-16le").decode(slice) : new TextDecoder("latin1").decode(slice);
          co += byteCount;
          rem -= stepChars;
        }
        // Skip rich text formatting runs and extended phonetic bytes.
        let skip = (rt > 0 ? rt * 4 : 0) + (ext > 0 ? ext : 0);
        while (skip > 0 && ci < chunks.length) {
          const avail = chunks[ci]!.data.length - co;
          if (avail <= skip) {
            skip -= avail;
            ci++;
            co = 0;
          } else {
            co += skip;
            skip = 0;
          }
        }
        sst.push(str);
      }
      pos = look;
      continue;
    }
    pos = bodyEnd;
  }

  // Second pass: read each worksheet's cell records.
  const sections: string[] = [];
  const starts = sheetOffsets.length ? sheetOffsets : [0];
  for (let si = 0; si < starts.length; si++) {
    let p = starts[si]!;
    const grid = new Map<number, string[]>();
    const setCell = (r: number, c: number, v: string) => {
      if (r >= MAX_SPREADSHEET_ROWS || c >= MAX_SPREADSHEET_COLS) return;
      let row = grid.get(r);
      if (!row) {
        row = [];
        grid.set(r, row);
      }
      while (row.length <= c) row.push("");
      row[c] = v.trim();
    };
    let lastFormulaCell: { r: number; c: number } | null = null;
    while (p + 4 <= wb.length) {
      const recId = dv.getUint16(p, true);
      const recLen = dv.getUint16(p + 2, true);
      const b = p + 4;
      const e = Math.min(wb.length, b + recLen);
      if (recId === 0x000a) break; // EOF
      if (recId === 0x00fd && e >= b + 10) {
        // LABELSST
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const idx = dv.getUint32(b + 6, true);
        setCell(r, c, sst[idx] ?? "");
      } else if (recId === 0x0204 && e >= b + 8) {
        // LABEL
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const len = dv.getUint16(b + 6, true);
        const { text } = readBiff8String(wb, b + 8, len);
        setCell(r, c, text);
      } else if (recId === 0x0203 && e >= b + 14) {
        // NUMBER
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const num = dv.getFloat64(b + 6, true);
        setCell(r, c, Number.isFinite(num) ? String(num) : "");
      } else if (recId === 0x027e && e >= b + 10) {
        // RK
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const num = decodeRkNumber(dv.getInt32(b + 6, true));
        setCell(r, c, Number.isFinite(num) ? String(num) : "");
      } else if (recId === 0x00bd && e >= b + 10) {
        // MULRK
        const r = dv.getUint16(b, true);
        const firstCol = dv.getUint16(b + 2, true);
        const lastCol = dv.getUint16(e - 2, true);
        let cur = b + 4;
        for (let c = firstCol; c <= lastCol && cur + 6 <= e - 2; c++, cur += 6) {
          const num = decodeRkNumber(dv.getInt32(cur + 2, true));
          setCell(r, c, Number.isFinite(num) ? String(num) : "");
        }
      } else if (recId === 0x0205 && e >= b + 8) {
        // BOOLERR
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const val = wb[b + 6]!;
        const isErr = wb[b + 7]!;
        if (!isErr) setCell(r, c, val ? "TRUE" : "FALSE");
      } else if (recId === 0x0006 && e >= b + 14) {
        // FORMULA
        const r = dv.getUint16(b, true);
        const c = dv.getUint16(b + 2, true);
        const byte6 = wb[b + 12]!;
        const byte7 = wb[b + 13]!;
        if (byte6 === 0xff && byte7 === 0xff) {
          if (wb[b + 6] === 0) lastFormulaCell = { r, c };
          else if (wb[b + 6] === 1) setCell(r, c, wb[b + 8] ? "TRUE" : "FALSE");
        } else {
          const num = dv.getFloat64(b + 6, true);
          if (Number.isFinite(num)) setCell(r, c, String(num));
        }
      } else if (recId === 0x0207 && lastFormulaCell && e >= b + 3) {
        // STRING (cached formula string)
        const len = dv.getUint16(b, true);
        const { text } = readBiff8String(wb, b + 2, len);
        setCell(lastFormulaCell.r, lastFormulaCell.c, text);
        lastFormulaCell = null;
      } else if (recId !== 0x0006) {
        lastFormulaCell = null;
      }
      p = e;
    }
    const sortedRows = [...grid.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    const formatted = formatTableForRag(sortedRows, sheetNames[si] ?? `Sheet ${si + 1}`);
    if (formatted) sections.push(formatted);
  }
  return sections.join("\n\n");
}

// ---------- Legacy Word .doc (OLE2 binary) ----------
function extractLegacyDocText(bytes: Uint8Array): string {
  const streams = readOle2Streams(bytes);
  const wordDoc = streams.get("worddocument") ?? bytes;
  // Heuristic extraction of readable UTF-16LE and ASCII/Latin-1 text runs from Word 97-2003 FIB/text body.
  const utf16Runs: string[] = [];
  let cur = "";
  for (let i = 0; i + 1 < wordDoc.length; i += 2) {
    const code = wordDoc[i]! | (wordDoc[i + 1]! << 8);
    if (code === 0x0d || code === 0x0b || code === 0x07) {
      if (cur.trim().length >= 3) utf16Runs.push(cur.trim());
      cur = "";
    } else if (code === 0x09) {
      cur += " ";
    } else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0x024f) || (code >= 0x0900 && code <= 0x097f)) {
      cur += String.fromCharCode(code);
    } else {
      if (cur.trim().length >= 8) utf16Runs.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim().length >= 8) utf16Runs.push(cur.trim());

  const asciiRuns: string[] = [];
  let asc = "";
  for (let i = 0; i < wordDoc.length; i++) {
    const b = wordDoc[i]!;
    if (b === 0x0d || b === 0x0a) {
      if (asc.trim().length >= 6 && /[a-zA-Z]{3,}/.test(asc)) asciiRuns.push(asc.trim());
      asc = "";
    } else if (b === 0x09 || (b >= 0x20 && b <= 0x7e)) {
      asc += String.fromCharCode(b);
    } else {
      if (asc.trim().length >= 12 && /[a-zA-Z]{3,}/.test(asc)) asciiRuns.push(asc.trim());
      asc = "";
    }
  }
  if (asc.trim().length >= 12 && /[a-zA-Z]{3,}/.test(asc)) asciiRuns.push(asc.trim());

  const filterNoise = (lines: string[]) =>
    lines.filter(
      (l) =>
        !/^(Microsoft|Word\.Document|Normal\.dot|Root Entry|CompObj|SummaryInformation|Times New Roman|Calibri|Cambria|Arial|Helvetica|Heading \d|Default Paragraph Font|Table Normal|Hyperlink|bjbj)/i.test(l) &&
        /[a-zA-Z0-9\u0900-\u097F]{2,}/.test(l),
    );

  const cleanU16 = filterNoise(utf16Runs);
  const cleanAsc = filterNoise(asciiRuns);
  const best = cleanU16.join("\n").length >= cleanAsc.join("\n").length ? cleanU16 : cleanAsc;
  const text = best.join("\n\n").trim();
  if (text.length < 20) {
    throw new KnowledgeError("This legacy .doc file could not be extracted cleanly. Save it as .docx or PDF and try again.");
  }
  return text;
}

// ---------- PPTX (OOXML PresentationML) ----------
function extractPptxText(bytes: Uint8Array): string {
  const files = safeUnzip(bytes, "PowerPoint (.pptx)");
  const slideKeys = Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!slideKeys.length) throw new KnowledgeError("No slides were found in this PowerPoint file.");

  const extractDrawingText = (xml: string): string => {
    const paras: string[] = [];
    const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(xml)) !== null) {
      const parts: string[] = [];
      const tRe = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/gi;
      let t: RegExpExecArray | null;
      while ((t = tRe.exec(m[1]!)) !== null) {
        parts.push(t[1] !== undefined ? decodeEntities(t[1]) : "\n");
      }
      const line = parts.join("").replace(/[ \t]+/g, " ").trim();
      if (line) paras.push(line);
    }
    return paras.join("\n");
  };

  const slides: string[] = [];
  slideKeys.forEach((key, idx) => {
    const num = Number(/slide(\d+)\.xml$/i.exec(key)?.[1] ?? idx + 1);
    const body = extractDrawingText(utf8.decode(files[key]!));
    const notesXml = readZipText(files, `ppt/notesSlides/notesSlide${num}.xml`);
    const notes = notesXml ? extractDrawingText(notesXml) : "";
    const combined = [body, notes ? `Speaker Notes: ${notes}` : ""].filter(Boolean).join("\n\n");
    if (combined.trim()) slides.push(`## Slide ${num}\n${combined}`);
  });
  return slides.join("\n\n");
}

// ---------- JSON / JSONL / YAML / XML ----------
function flattenJsonValue(val: unknown, prefix = "", depth = 0): string[] {
  if (val === null || val === undefined) return [];
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    const s = String(val).trim();
    if (!s) return [];
    return [prefix ? `${prefix}: ${s}` : s];
  }
  if (depth > 8) return [prefix ? `${prefix}: ${JSON.stringify(val)}` : JSON.stringify(val)];
  if (Array.isArray(val)) {
    if (!val.length) return [];
    if (val.every((v) => v === null || typeof v !== "object")) {
      const joined = val.filter((v) => v !== null && v !== undefined).map(String).join(", ");
      return joined ? [prefix ? `${prefix}: ${joined}` : joined] : [];
    }
    const out: string[] = [];
    for (let i = 0; i < Math.min(val.length, 2000); i++) {
      const item = val[i];
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const parts = Object.entries(item as Record<string, unknown>)
          .flatMap(([k, v]) => flattenJsonValue(v, k, depth + 1));
        if (parts.length) out.push(parts.join(" | "));
      } else {
        out.push(...flattenJsonValue(item, prefix ? `${prefix}[${i}]` : "", depth + 1));
      }
    }
    return out;
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out.push(...flattenJsonValue(v, prefix ? `${prefix}.${k}` : k, depth + 1));
  }
  return out;
}

function extractStructuredText(bytes: Uint8Array, ext: string): string {
  const raw = decodeTextBytes(bytes);
  if (ext === "json") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const lines = flattenJsonValue(parsed);
      return lines.length ? lines.join("\n") : raw;
    } catch {
      return raw;
    }
  }
  if (ext === "jsonl") {
    const out: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parts = flattenJsonValue(JSON.parse(trimmed));
        if (parts.length) out.push(parts.join(" | "));
      } catch {
        out.push(trimmed);
      }
    }
    return out.join("\n");
  }
  if (ext === "xml") {
    // Handle Excel 2003 SpreadsheetML XML exports gracefully if uploaded as .xml
    if (/<Workbook\b[^>]*schemas-microsoft-com:office:spreadsheet/i.test(raw)) {
      return extractSpreadsheetMlXml(raw);
    }
    return decodeEntities(
      raw
        .replace(/<\?[\s\S]*?\?>/g, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<\/[^>]+>/g, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return raw;
}

/** Handles Excel 2003 XML ("SpreadsheetML") files that some financial/government portals export as .xls or .xml. */
function extractSpreadsheetMlXml(xml: string): string {
  const sheets: string[] = [];
  const wsRe = /<Worksheet\b([^>]*)>([\s\S]*?)<\/Worksheet>/gi;
  let wm: RegExpExecArray | null;
  while ((wm = wsRe.exec(xml)) !== null) {
    const name = decodeEntities(/ss:Name="([^"]+)"/i.exec(wm[1]!)?.[1] ?? `Sheet ${sheets.length + 1}`);
    const rows: string[][] = [];
    const rowRe = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(wm[2]!)) !== null && rows.length < MAX_SPREADSHEET_ROWS) {
      const row: string[] = [];
      const cellRe = /<Cell\b[^>]*>([\s\S]*?)<\/Cell>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]!)) !== null && row.length < MAX_SPREADSHEET_COLS) {
        const data = /<Data\b[^>]*>([\s\S]*?)<\/Data>/i.exec(cm[1]!)?.[1] ?? cm[1]!.replace(/<[^>]+>/g, " ");
        row.push(decodeEntities(data).trim());
      }
      if (row.some((c) => c.length > 0)) rows.push(row);
    }
    const formatted = formatTableForRag(rows, name);
    if (formatted) sheets.push(formatted);
  }
  return sheets.join("\n\n");
}

// ---------- Main file extraction entrypoint ----------
export async function extractFileText(kind: FileDocKind, bytes: Uint8Array, filename = ""): Promise<string> {
  const ext = extensionFromFilename(filename);

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

  if (kind === "docx") {
    if (isZipSignature(bytes)) {
      const files = safeUnzip(bytes, ext === "odt" ? "OpenDocument (.odt)" : "Word (.docx)");
      if (readZipText(files, "content.xml") && !readZipText(files, "word/document.xml")) {
        return extractOdfTextXml(readZipText(files, "content.xml")!).slice(0, MAX_TEXT_CHARS);
      }
      return extractDocxText(bytes).slice(0, MAX_TEXT_CHARS);
    }
    if (isOle2Signature(bytes)) {
      return extractLegacyDocText(bytes).slice(0, MAX_TEXT_CHARS);
    }
    const textPreview = new TextDecoder("utf-8").decode(bytes.subarray(0, 128)).trimStart();
    if (textPreview.startsWith("{\\rtf")) {
      return extractRtfText(decodeTextBytes(bytes)).slice(0, MAX_TEXT_CHARS);
    }
    if (/^(<!doctype|<html|<xml|<\?xml)/i.test(textPreview)) {
      return htmlToText(decodeTextBytes(bytes)).text.slice(0, MAX_TEXT_CHARS);
    }
    if (ext === "rtf") return extractRtfText(decodeTextBytes(bytes)).slice(0, MAX_TEXT_CHARS);
    throw new KnowledgeError("This Word document format could not be recognized. Upload a valid .docx, .doc, .odt, or .rtf file.");
  }

  if (kind === "xlsx") {
    if (isZipSignature(bytes)) {
      const files = safeUnzip(bytes, ext === "ods" ? "ODS spreadsheet" : "Excel (.xlsx)");
      if (readZipText(files, "content.xml") && !readZipText(files, "xl/workbook.xml")) {
        return extractOdsText(bytes).slice(0, MAX_TEXT_CHARS);
      }
      return extractXlsxText(bytes).slice(0, MAX_TEXT_CHARS);
    }
    if (isOle2Signature(bytes)) {
      return extractBiff8XlsText(bytes).slice(0, MAX_TEXT_CHARS);
    }
    // Many enterprise / financial portals export HTML tables or SpreadsheetML XML with a `.xls` extension.
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 512)).trimStart();
    if (/<Workbook\b[^>]*schemas-microsoft-com:office:spreadsheet/i.test(head)) {
      return extractSpreadsheetMlXml(decodeTextBytes(bytes)).slice(0, MAX_TEXT_CHARS);
    }
    if (/^(<!doctype|<html|<table)/i.test(head)) {
      return htmlToText(decodeTextBytes(bytes)).text.slice(0, MAX_TEXT_CHARS);
    }
    if (!bytes.includes(0)) {
      return extractCsvText(bytes, "csv").slice(0, MAX_TEXT_CHARS);
    }
    throw new KnowledgeError("This spreadsheet could not be read. Upload a valid .xlsx, .xls, .ods, or .csv file.");
  }

  if (kind === "csv") {
    return extractCsvText(bytes, ext || "csv").slice(0, MAX_TEXT_CHARS);
  }

  if (kind === "pptx") {
    if (isZipSignature(bytes)) {
      const files = safeUnzip(bytes, ext === "odp" ? "OpenDocument (.odp)" : "PowerPoint (.pptx)");
      if (readZipText(files, "content.xml") && !Object.keys(files).some((k) => /^ppt\/slides\//i.test(k))) {
        return extractOdfTextXml(readZipText(files, "content.xml")!).slice(0, MAX_TEXT_CHARS);
      }
      return extractPptxText(bytes).slice(0, MAX_TEXT_CHARS);
    }
    throw new KnowledgeError("This presentation file could not be read. Upload a valid .pptx or .odp file.");
  }

  if (kind === "json") {
    return extractStructuredText(bytes, ext || "json").slice(0, MAX_TEXT_CHARS);
  }

  if (kind === "html") {
    return htmlToText(decodeTextBytes(bytes)).text.slice(0, MAX_TEXT_CHARS);
  }

  // txt / md
  return decodeTextBytes(bytes).slice(0, MAX_TEXT_CHARS);
}

export { fetchPageText } from "./scrape";
