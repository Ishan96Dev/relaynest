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

export const TYPE_LABEL = { pdf: "PDF", txt: "TXT", md: "MD", url: "URL" } as const;
