import "server-only";

/**
 * Telegram does not let bots (or any API a server can use without a personal Telegram login) ask @BotFather whether a
 * username is free. Telegram's public profile page https://t.me/<username> is the closest public signal:
 * a page with a profile title means the username is taken, a bare "Contact @name" page means nobody uses it.
 * BotFather still has the final word (it also blocks reserved names), so "available" means "very likely available".
 */
export type UsernameStatus = "available" | "taken" | "invalid" | "unknown";

/** Rules BotFather enforces on bot usernames, or null when the username is acceptable. */
export function botUsernameProblem(username: string): string | null {
  if (username.length < 5) return "Usernames must be at least 5 characters.";
  if (username.length > 32) return "Usernames can be at most 32 characters.";
  if (!/^[A-Za-z0-9_]+$/.test(username)) return "Use only letters, numbers and underscores.";
  if (!/^[A-Za-z]/.test(username)) return "A username must start with a letter.";
  if (!/bot$/i.test(username)) return "A bot username must end in \"bot\", for example my_shop_bot.";
  return null;
}

export async function checkBotUsername(username: string): Promise<UsernameStatus> {
  if (botUsernameProblem(username)) return "invalid";
  try {
    const res = await fetch(`https://t.me/${username}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; RelayNest/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "unknown";
    const html = await res.text();
    return html.includes("tgme_page_title") ? "taken" : "available";
  } catch {
    return "unknown";
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Candidate usernames built from a bot name or a taken username. */
function candidates(seed: string): string[] {
  const stem = slug(seed).replace(/_?bot$/, "").replace(/^[0-9_]+/, "").slice(0, 20) || "relay";
  const n = () => Math.floor(10 + Math.random() * 90);
  const list = [
    `${stem}_bot`, `${stem}bot`, `${stem}_ai_bot`, `${stem}_hq_bot`, `my${stem}bot`, `get${stem}bot`,
    `${stem}_app_bot`, `try${stem}bot`, `${stem}_official_bot`, `${stem}${n()}_bot`, `${stem}_${n()}_bot`, `the${stem}bot`,
  ];
  return [...new Set(list)].filter((u) => !botUsernameProblem(u));
}

/** Up to `limit` usernames that look free, checked in parallel. */
export async function suggestBotUsernames(seed: string, exclude: string, limit = 5): Promise<string[]> {
  const pool = candidates(seed).filter((u) => u.toLowerCase() !== exclude.toLowerCase()).slice(0, 10);
  const results = await Promise.all(pool.map(async (u) => ({ u, s: await checkBotUsername(u) })));
  return results.filter((r) => r.s === "available").map((r) => r.u).slice(0, limit);
}
