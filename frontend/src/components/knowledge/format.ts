import type { DocKind } from "@backend/server/knowledge/extract";
import type { ScrapeMode } from "@backend/server/knowledge/scrape";

export function formatBytes(n: number): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return withTime ? `${date}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : date;
}

export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const TYPE_LABEL: Record<DocKind, string> = {
  pdf: "PDF",
  docx: "WORD",
  xlsx: "XLSX",
  csv: "CSV",
  pptx: "PPTX",
  txt: "TXT",
  md: "MD",
  json: "JSON",
  html: "HTML",
  url: "URL",
};

export const SCRAPE_MODE_LABEL: Record<ScrapeMode, string> = {
  single: "Single Page",
  sitemap: "Sitemap",
  subpages: "Subpages",
};

export const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  discovering: "Discovering sitemap",
  scraping: "Scraping pages",
  extracting: "Extracting text",
  chunking: "Chunking content",
  embedding: "Generating embeddings",
  completed: "Completed",
  failed: "Failed",
};
