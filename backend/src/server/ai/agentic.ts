/**
 * Pure autonomous Agentic Tool Planner.
 * Decides which live tools (NSE/BSE/MSE Market Data, Open Web Research) to invoke for any natural-language message
 * or slash command — zero extra LLM round-trip required, deterministic, and unit-testable.
 */
import type { AgentCommand } from "../../lib/validation/schemas";

export interface AgenticPlanInput {
  message: string;
  command?: Pick<AgentCommand, "command" | "kind" | "instruction"> | null;
  /** Whether autonomous web research on natural messages is enabled. */
  autoSearch?: boolean;
  /** Whether live NSE/BSE/MSE & market quote lookup is enabled. */
  marketData?: boolean;
  /** Explicitly forced web search (e.g. Playground Web Search toggle or /search). */
  forceWebSearch?: boolean;
  /** Optional agent category to tune domain query enrichment. */
  agentCategory?: string;
}

export interface AgenticPlan {
  shouldFetchMarket: boolean;
  marketQuery: string;
  shouldSearchWeb: boolean;
  webQuery: string;
  /** Skip image/video enrichment for ultra-fast single-price ticker lookups. */
  lightweightWeb: boolean;
  reason: string;
}

const GREETING_ONLY_RE =
  /^(hi+|hey+|hello+|hola|namaste|good\s+(morning|afternoon|evening|night)|thanks?|thank\s+you|thx|ok(ay)?|cool|great|bye|goodbye|gm|gn|yo|sup|how\s+are\s+you\??|who\s+are\s+you\??|what\s+can\s+you\s+do\??)[!.\s]*$/i;

const MARKET_SIGNAL_RE =
  /\b(nse|bse|mse|msei|metropolitan\s+stock\s+exchange|nifty|nifty\s*50|sensex|bank\s*nifty|india\s*vix|stock|stocks|share\s+price|shares|equity|equities|ltp|cmp|ticker|watchlist|52\s*week|52w|market\s+cap|pe\s+ratio|p\/e|dividend|ipo|pre[- ]?market|post[- ]?market|indian\s+market|mcx|gold\s+(price|rate)|silver\s+(price|rate)|crude\s+oil|brent|usd\s*\/?\s*inr|eur\s*\/?\s*inr|dollar\s+rate|bitcoin|btc|ethereum|eth|solana|crypto|reliance|tcs|infy|infosys|hdfc\s*bank|hdfcbank|icici\s*bank|icicibank|sbin|sbi\s+share|airtel|bhartiartl|itc|tata\s*motors|tatamotors|tata\s*steel|tatasteel|tata\s*power|bajaj\s*finance|bajfinance|maruti|sun\s*pharma|wipro|hcl\s*tech|hcltech|adani|axis\s*bank|kotak|asian\s*paints|titan|zomato|eternal|paytm|dmart|trent|irctc|irfc|rvnl|suzlon|jiofin|yes\s*bank|hal\s+share|bel\s+share|dlf|mrf|cdsl|polycab|dixon|indigo|swiggy)\b|\.(ns|bo)\b|\$[a-z]{2,12}\b/i;

const LIVE_WEB_SIGNAL_RE =
  /\b(today|tonight|now|live|latest|current|recent|breaking|update|updates|news|brief|briefing|digest|daily|2025|2026|2027|price|prices|rate|rates|cost|worth|value|circle\s+rate|guidance\s+value|land|plot|plots|property|real\s+estate|rera|sq\.?\s*ft|sqft|acre|bigha|hectare|stamp\s+duty|exam|jee|neet|upsc|gate|cat|cuet|cbse|icse|result|results|cutoff|cutoffs|admit\s+card|syllabus|scholarship|scholarships|admission|college|rank|ranking|score|scores|match|fixture|fixtures|schedule|standings|points\s+table|ipl|icc|cricket|football|premier\s+league|champions\s+league|f1|nba|tennis|kabaddi|esports|valorant|bgmi|cs2|dota|lol|patch\s+notes|steam|deal|deals|discount|release\s+date|weather|forecast|monsoon|imd|mandi|msp|crop|circular|rbi|sebi|gst|cbdt|cbic|income\s+tax|compliance|tender|funding|startup|competitor|flight|flights|train|visa|specs|specification|compare|vs\.?|versus|best|top|check|search|find|lookup|look\s+up|fetch|go\s+to)\b/i;

const SINGLE_QUOTE_ONLY_RE =
  /\b(single|only\s+price|just\s+price|quick\s+price|ltp\s+only|current\s+price\s+only|one[- ]line)\b/i;

const MARKET_COMMANDS = new Set(["stock", "market", "quote", "price", "nifty", "sensex", "gold", "crypto", "forex", "watchlist"]);
const BRIEF_COMMANDS = new Set(["brief", "digest", "daily", "morning", "recap"]);
const SEARCH_COMMANDS = new Set([
  "search", "rates", "locality", "land", "exam", "scholarship", "company", "competitor", "funding",
  "circular", "gst", "tax", "score", "fixture", "standings", "patch", "esports", "deals", "news",
  "weather", "trip", "visa", "specs", "mandi", "scheme", "compare",
]);

/** Returns true when a message looks like a trivial conversational greeting with no live lookup need. */
export function isGreetingOnly(message: string): boolean {
  return GREETING_ONLY_RE.test(message.trim());
}

/** Detects if a message asks about stocks, Indian exchanges (NSE/BSE/MSE), indices, commodities, forex, or crypto. */
export function hasMarketIntent(message: string): boolean {
  return MARKET_SIGNAL_RE.test(message);
}

/** Detects if a message benefits from live web research. */
export function hasLiveWebIntent(message: string): boolean {
  return LIVE_WEB_SIGNAL_RE.test(message);
}

/** Refines the web search query so NSE/BSE/MSE, land, exam, sports, or gaming queries hit high-signal live pages. */
export function buildTargetedWebQuery(rawMessage: string, opts: { marketIntent: boolean; agentCategory?: string; commandName?: string }): string {
  const clean = rawMessage.replace(/\s+/g, " ").trim().slice(0, 220);
  if (!clean) return "";

  const lower = clean.toLowerCase();
  if (opts.marketIntent) {
    const hasExchange = /\b(nse|bse|mse|msei|mcx|nifty|sensex|crypto|bitcoin|gold|silver|forex|usd)\b/i.test(clean);
    const hasMse = /\b(mse|msei|metropolitan stock exchange)\b/i.test(clean);
    if (hasMse && !lower.includes("msei.in")) {
      return `${clean} NSE BSE MSEI India stock exchange`.slice(0, 260);
    }
    if (!hasExchange) {
      return `${clean} NSE BSE India share price fundamentals news`.slice(0, 260);
    }
    return clean;
  }

  if (opts.agentCategory === "Real Estate & Land" && !/\b(india|price|rate|sqft|rera|land|plot|property)\b/i.test(clean)) {
    return `${clean} real estate land property rates`.slice(0, 260);
  }
  if (opts.commandName === "mandi" && !/mandi/i.test(clean)) {
    return `${clean} mandi bhav rate India today`.slice(0, 260);
  }
  return clean;
}

/**
 * Computes a deterministic tool execution plan for an incoming Playground or Telegram message.
 */
export function planAgenticExecution(input: AgenticPlanInput): AgenticPlan {
  const raw = input.message.trim();
  const cmdName = input.command?.command?.toLowerCase();
  const cmdKind = input.command?.kind;

  if (!raw && !cmdName) {
    return { shouldFetchMarket: false, marketQuery: "", shouldSearchWeb: false, webQuery: "", lightweightWeb: false, reason: "empty" };
  }

  // Dedicated slash command kinds take priority
  if (cmdKind === "market" || (cmdName && MARKET_COMMANDS.has(cmdName))) {
    const marketQuery = raw || (cmdName === "market" ? "NSE BSE NIFTY 50 SENSEX BANK NIFTY Indian stock market today" : `${cmdName} live price today`);
    const singleOnly = SINGLE_QUOTE_ONLY_RE.test(marketQuery) && !/\b(mse|msei|news|fundamental|detail|analysis)\b/i.test(marketQuery);
    return {
      shouldFetchMarket: true,
      marketQuery,
      shouldSearchWeb: !singleOnly,
      webQuery: singleOnly ? "" : buildTargetedWebQuery(marketQuery, { marketIntent: true, agentCategory: input.agentCategory, commandName: cmdName }),
      lightweightWeb: true,
      reason: `market-command:/${cmdName ?? "market"}`,
    };
  }

  if (cmdKind === "brief" || (cmdName && BRIEF_COMMANDS.has(cmdName))) {
    const baseTopic =
      raw ||
      input.command?.instruction?.trim() ||
      (input.agentCategory === "Finance & Markets"
        ? "Daily Indian stock market NSE BSE MSE NIFTY 50 SENSEX top stocks & news briefing"
        : `Daily ${input.agentCategory ?? "news & research"} briefing today`);
    const marketIntent = Boolean(input.marketData) || hasMarketIntent(baseTopic) || input.agentCategory === "Finance & Markets";
    return {
      shouldFetchMarket: marketIntent,
      marketQuery: marketIntent ? baseTopic : "",
      shouldSearchWeb: true,
      webQuery: buildTargetedWebQuery(baseTopic, { marketIntent, agentCategory: input.agentCategory, commandName: cmdName }),
      lightweightWeb: marketIntent,
      reason: `brief-command:/${cmdName ?? "brief"}`,
    };
  }

  if (cmdKind === "search" || (cmdName && SEARCH_COMMANDS.has(cmdName))) {
    const marketIntent = Boolean(input.marketData) && hasMarketIntent(raw);
    return {
      shouldFetchMarket: marketIntent,
      marketQuery: marketIntent ? raw : "",
      shouldSearchWeb: Boolean(raw),
      webQuery: buildTargetedWebQuery(raw, { marketIntent, agentCategory: input.agentCategory, commandName: cmdName }),
      lightweightWeb: marketIntent,
      reason: `search-command:/${cmdName ?? "search"}`,
    };
  }

  // Skip autonomous search on short greetings unless webSearch was explicitly forced
  if (isGreetingOnly(raw) && !input.forceWebSearch) {
    return { shouldFetchMarket: false, marketQuery: "", shouldSearchWeb: false, webQuery: "", lightweightWeb: false, reason: "greeting" };
  }

  const marketIntent = hasMarketIntent(raw);
  const liveWebIntent = hasLiveWebIntent(raw);

  const shouldFetchMarket = Boolean(input.marketData && marketIntent);
  const singleOnly = shouldFetchMarket && SINGLE_QUOTE_ONLY_RE.test(raw) && !/\b(mse|msei|news|fundamental|detail|analysis)\b/i.test(raw);

  const shouldSearchWeb = Boolean(
    !singleOnly &&
      (input.forceWebSearch ||
        (input.autoSearch && (liveWebIntent || marketIntent || raw.split(/\s+/).length >= 5)) ||
        (shouldFetchMarket && !singleOnly)),
  );

  return {
    shouldFetchMarket,
    marketQuery: shouldFetchMarket ? raw : "",
    shouldSearchWeb,
    webQuery: shouldSearchWeb ? buildTargetedWebQuery(raw, { marketIntent: shouldFetchMarket || marketIntent, agentCategory: input.agentCategory }) : "",
    lightweightWeb: shouldFetchMarket,
    reason: shouldFetchMarket && shouldSearchWeb
      ? "autonomous:market+web"
      : shouldFetchMarket
        ? "autonomous:market"
        : shouldSearchWeb
          ? input.forceWebSearch
            ? "forced:web"
            : "autonomous:web"
          : "none",
  };
}
