import "server-only";
import {
  type MarketDetailLevel,
  type MarketExchange,
  type MarketQuote,
  type MarketSnapshot,
} from "@backend/server/ai/market-data-types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const QUOTE_TIMEOUT_MS = 4_800;

interface KnownInstrument {
  symbol: string;
  name: string;
  exchange: MarketExchange;
  /** Exchange tickers to fetch; for Indian equities we support NSE (.NS) and BSE (.BO). */
  nseTicker?: string;
  bseTicker?: string;
  directTicker?: string;
  aliases: string[];
}

/** High-frequency Indian equities (NSE/BSE), benchmark indices, commodities, forex & top crypto. */
const KNOWN_INSTRUMENTS: KnownInstrument[] = [
  // Indian Benchmark Indices
  { symbol: "NIFTY 50", name: "NIFTY 50 (NSE)", exchange: "INDEX", directTicker: "^NSEI", aliases: ["nifty", "nifty50", "nifty 50", "nse nifty"] },
  { symbol: "SENSEX", name: "BSE SENSEX", exchange: "INDEX", directTicker: "^BSESN", aliases: ["sensex", "bse sensex", "bse 30", "bse30"] },
  { symbol: "BANK NIFTY", name: "NIFTY Bank", exchange: "INDEX", directTicker: "^NSEBANK", aliases: ["banknifty", "bank nifty", "nifty bank"] },
  { symbol: "NIFTY IT", name: "NIFTY IT", exchange: "INDEX", directTicker: "^CNXIT", aliases: ["nifty it", "niftyit"] },
  { symbol: "INDIA VIX", name: "India VIX", exchange: "INDEX", directTicker: "^INDIAVIX", aliases: ["india vix", "vix"] },

  // Major Indian Equities (NSE & BSE dual-listed)
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "NSE", nseTicker: "RELIANCE.NS", bseTicker: "RELIANCE.BO", aliases: ["reliance", "ril", "reliance industries"] },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", nseTicker: "TCS.NS", bseTicker: "TCS.BO", aliases: ["tcs", "tata consultancy", "tata consultancy services"] },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE", nseTicker: "INFY.NS", bseTicker: "INFY.BO", aliases: ["infy", "infosys"] },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE", nseTicker: "HDFCBANK.NS", bseTicker: "HDFCBANK.BO", aliases: ["hdfcbank", "hdfc bank", "hdfc"] },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE", nseTicker: "ICICIBANK.NS", bseTicker: "ICICIBANK.BO", aliases: ["icicibank", "icici bank", "icici"] },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", nseTicker: "SBIN.NS", bseTicker: "SBIN.BO", aliases: ["sbin", "sbi", "state bank", "state bank of india"] },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", exchange: "NSE", nseTicker: "BHARTIARTL.NS", bseTicker: "BHARTIARTL.BO", aliases: ["bhartiartl", "airtel", "bharti airtel"] },
  { symbol: "ITC", name: "ITC Ltd", exchange: "NSE", nseTicker: "ITC.NS", bseTicker: "ITC.BO", aliases: ["itc", "itc ltd"] },
  { symbol: "LT", name: "Larsen & Toubro Ltd", exchange: "NSE", nseTicker: "LT.NS", bseTicker: "LT.BO", aliases: ["larsen", "l&t", "larsen and toubro", "larsen & toubro"] },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE", nseTicker: "TATAMOTORS.NS", bseTicker: "TATAMOTORS.BO", aliases: ["tatamotors", "tata motors"] },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", exchange: "NSE", nseTicker: "TATASTEEL.NS", bseTicker: "TATASTEEL.BO", aliases: ["tatasteel", "tata steel"] },
  { symbol: "TATAPOWER", name: "Tata Power Co Ltd", exchange: "NSE", nseTicker: "TATAPOWER.NS", bseTicker: "TATAPOWER.BO", aliases: ["tatapower", "tata power"] },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", exchange: "NSE", nseTicker: "BAJFINANCE.NS", bseTicker: "BAJFINANCE.BO", aliases: ["bajfinance", "bajaj finance"] },
  { symbol: "MARUTI", name: "Maruti Suzuki India", exchange: "NSE", nseTicker: "MARUTI.NS", bseTicker: "MARUTI.BO", aliases: ["maruti", "maruti suzuki"] },
  { symbol: "M&M", name: "Mahindra & Mahindra", exchange: "NSE", nseTicker: "M&M.NS", bseTicker: "M&M.BO", aliases: ["m&m", "mahindra", "mahindra & mahindra"] },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Ind.", exchange: "NSE", nseTicker: "SUNPHARMA.NS", bseTicker: "SUNPHARMA.BO", aliases: ["sunpharma", "sun pharma"] },
  { symbol: "WIPRO", name: "Wipro Ltd", exchange: "NSE", nseTicker: "WIPRO.NS", bseTicker: "WIPRO.BO", aliases: ["wipro"] },
  { symbol: "HCLTECH", name: "HCL Technologies Ltd", exchange: "NSE", nseTicker: "HCLTECH.NS", bseTicker: "HCLTECH.BO", aliases: ["hcltech", "hcl tech", "hcl technologies"] },
  { symbol: "TECHM", name: "Tech Mahindra Ltd", exchange: "NSE", nseTicker: "TECHM.NS", bseTicker: "TECHM.BO", aliases: ["techm", "tech mahindra"] },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", exchange: "NSE", nseTicker: "ADANIENT.NS", bseTicker: "ADANIENT.BO", aliases: ["adanient", "adani enterprises", "adani ent"] },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", exchange: "NSE", nseTicker: "ADANIPORTS.NS", bseTicker: "ADANIPORTS.BO", aliases: ["adaniports", "adani ports"] },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", exchange: "NSE", nseTicker: "AXISBANK.NS", bseTicker: "AXISBANK.BO", aliases: ["axisbank", "axis bank"] },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", exchange: "NSE", nseTicker: "KOTAKBANK.NS", bseTicker: "KOTAKBANK.BO", aliases: ["kotakbank", "kotak bank", "kotak mahindra"] },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", exchange: "NSE", nseTicker: "ASIANPAINT.NS", bseTicker: "ASIANPAINT.BO", aliases: ["asianpaint", "asian paints"] },
  { symbol: "TITAN", name: "Titan Company Ltd", exchange: "NSE", nseTicker: "TITAN.NS", bseTicker: "TITAN.BO", aliases: ["titan", "titan company"] },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", exchange: "NSE", nseTicker: "HINDUNILVR.NS", bseTicker: "HINDUNILVR.BO", aliases: ["hindunilvr", "hul", "hindustan unilever"] },
  { symbol: "NTPC", name: "NTPC Ltd", exchange: "NSE", nseTicker: "NTPC.NS", bseTicker: "NTPC.BO", aliases: ["ntpc"] },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp.", exchange: "NSE", nseTicker: "ONGC.NS", bseTicker: "ONGC.BO", aliases: ["ongc"] },
  { symbol: "POWERGRID", name: "Power Grid Corp. of India", exchange: "NSE", nseTicker: "POWERGRID.NS", bseTicker: "POWERGRID.BO", aliases: ["powergrid", "power grid"] },
  { symbol: "COALINDIA", name: "Coal India Ltd", exchange: "NSE", nseTicker: "COALINDIA.NS", bseTicker: "COALINDIA.BO", aliases: ["coalindia", "coal india"] },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd", exchange: "NSE", nseTicker: "JSWSTEEL.NS", bseTicker: "JSWSTEEL.BO", aliases: ["jswsteel", "jsw steel"] },
  { symbol: "ETERNAL", name: "Eternal Ltd (Zomato)", exchange: "NSE", nseTicker: "ETERNAL.NS", bseTicker: "ETERNAL.BO", aliases: ["zomato", "eternal"] },
  { symbol: "PAYTM", name: "One 97 Communications (Paytm)", exchange: "NSE", nseTicker: "PAYTM.NS", bseTicker: "PAYTM.BO", aliases: ["paytm", "one97"] },
  { symbol: "DMART", name: "Avenue Supermarts (DMart)", exchange: "NSE", nseTicker: "DMART.NS", bseTicker: "DMART.BO", aliases: ["dmart", "d-mart", "avenue supermarts"] },
  { symbol: "TRENT", name: "Trent Ltd", exchange: "NSE", nseTicker: "TRENT.NS", bseTicker: "TRENT.BO", aliases: ["trent"] },
  { symbol: "HAL", name: "Hindustan Aeronautics Ltd", exchange: "NSE", nseTicker: "HAL.NS", bseTicker: "HAL.BO", aliases: ["hal", "hindustan aeronautics"] },
  { symbol: "BEL", name: "Bharat Electronics Ltd", exchange: "NSE", nseTicker: "BEL.NS", bseTicker: "BEL.BO", aliases: ["bharat electronics", "bel"] },
  { symbol: "IRCTC", name: "IRCTC Ltd", exchange: "NSE", nseTicker: "IRCTC.NS", bseTicker: "IRCTC.BO", aliases: ["irctc"] },
  { symbol: "IRFC", name: "Indian Railway Finance Corp", exchange: "NSE", nseTicker: "IRFC.NS", bseTicker: "IRFC.BO", aliases: ["irfc"] },
  { symbol: "RVNL", name: "Rail Vikas Nigam Ltd", exchange: "NSE", nseTicker: "RVNL.NS", bseTicker: "RVNL.BO", aliases: ["rvnl"] },
  { symbol: "LICI", name: "Life Insurance Corp. of India", exchange: "NSE", nseTicker: "LICI.NS", bseTicker: "LICI.BO", aliases: ["lici", "lic india", "lic share"] },
  { symbol: "JIOFIN", name: "Jio Financial Services", exchange: "NSE", nseTicker: "JIOFIN.NS", bseTicker: "JIOFIN.BO", aliases: ["jiofin", "jio financial"] },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd", exchange: "NSE", nseTicker: "SUZLON.NS", bseTicker: "SUZLON.BO", aliases: ["suzlon", "suzlon energy"] },
  { symbol: "YESBANK", name: "Yes Bank Ltd", exchange: "NSE", nseTicker: "YESBANK.NS", bseTicker: "YESBANK.BO", aliases: ["yesbank", "yes bank"] },
  { symbol: "IDEA", name: "Vodafone Idea Ltd", exchange: "NSE", nseTicker: "IDEA.NS", bseTicker: "IDEA.BO", aliases: ["vodafone idea", "vi share", "idea share"] },
  { symbol: "MRF", name: "MRF Ltd", exchange: "NSE", nseTicker: "MRF.NS", bseTicker: "MRF.BO", aliases: ["mrf"] },
  { symbol: "DIXON", name: "Dixon Technologies", exchange: "NSE", nseTicker: "DIXON.NS", bseTicker: "DIXON.BO", aliases: ["dixon", "dixon technologies"] },
  { symbol: "POLYCAB", name: "Polycab India Ltd", exchange: "NSE", nseTicker: "POLYCAB.NS", bseTicker: "POLYCAB.BO", aliases: ["polycab"] },
  { symbol: "INDIGO", name: "InterGlobe Aviation (IndiGo)", exchange: "NSE", nseTicker: "INDIGO.NS", bseTicker: "INDIGO.BO", aliases: ["indigo", "interglobe"] },
  { symbol: "BSE", name: "BSE Ltd", exchange: "NSE", nseTicker: "BSE.NS", bseTicker: "BSE.BO", aliases: ["bse ltd", "bse stock"] },
  { symbol: "CDSL", name: "Central Depository Services", exchange: "NSE", nseTicker: "CDSL.NS", bseTicker: "CDSL.BO", aliases: ["cdsl"] },
  { symbol: "MCX", name: "Multi Commodity Exchange", exchange: "NSE", nseTicker: "MCX.NS", bseTicker: "MCX.BO", aliases: ["mcx india", "mcx stock"] },
  { symbol: "DLF", name: "DLF Ltd", exchange: "NSE", nseTicker: "DLF.NS", bseTicker: "DLF.BO", aliases: ["dlf"] },
  { symbol: "GODREJPROP", name: "Godrej Properties Ltd", exchange: "NSE", nseTicker: "GODREJPROP.NS", bseTicker: "GODREJPROP.BO", aliases: ["godrejprop", "godrej properties"] },
  { symbol: "LODHA", name: "Macrotech Developers (Lodha)", exchange: "NSE", nseTicker: "LODHA.NS", bseTicker: "LODHA.BO", aliases: ["lodha", "macrotech"] },
  { symbol: "SWIGGY", name: "Swiggy Ltd", exchange: "NSE", nseTicker: "SWIGGY.NS", bseTicker: "SWIGGY.BO", aliases: ["swiggy"] },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", exchange: "NSE", nseTicker: "ULTRACEMCO.NS", bseTicker: "ULTRACEMCO.BO", aliases: ["ultracemco", "ultratech"] },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", exchange: "NSE", nseTicker: "DRREDDY.NS", bseTicker: "DRREDDY.BO", aliases: ["drreddy", "dr reddy", "dr reddys"] },
  { symbol: "CIPLA", name: "Cipla Ltd", exchange: "NSE", nseTicker: "CIPLA.NS", bseTicker: "CIPLA.BO", aliases: ["cipla"] },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", exchange: "NSE", nseTicker: "BAJAJ-AUTO.NS", bseTicker: "BAJAJ-AUTO.BO", aliases: ["bajaj auto", "bajaj-auto"] },
  { symbol: "EICHERMOT", name: "Eicher Motors Ltd", exchange: "NSE", nseTicker: "EICHERMOT.NS", bseTicker: "EICHERMOT.BO", aliases: ["eichermot", "eicher motors", "royal enfield"] },

  // Commodities, Forex & Top Crypto
  { symbol: "GOLD", name: "Gold Futures (COMEX)", exchange: "COMMODITY", directTicker: "GC=F", aliases: ["gold", "gold price", "gold rate", "mcx gold", "xau"] },
  { symbol: "SILVER", name: "Silver Futures (COMEX)", exchange: "COMMODITY", directTicker: "SI=F", aliases: ["silver", "silver price", "silver rate", "mcx silver"] },
  { symbol: "CRUDE OIL", name: "Brent Crude Oil", exchange: "COMMODITY", directTicker: "BZ=F", aliases: ["crude", "crude oil", "brent", "oil price"] },
  { symbol: "USD/INR", name: "USD / INR Exchange Rate", exchange: "FOREX", directTicker: "INR=X", aliases: ["usdinr", "usd/inr", "usd inr", "dollar rate", "rupee"] },
  { symbol: "EUR/INR", name: "EUR / INR Exchange Rate", exchange: "FOREX", directTicker: "EURINR=X", aliases: ["eurinr", "eur/inr", "eur inr"] },
  { symbol: "BTC", name: "Bitcoin (USD)", exchange: "CRYPTO", directTicker: "BTC-USD", aliases: ["bitcoin", "btc"] },
  { symbol: "ETH", name: "Ethereum (USD)", exchange: "CRYPTO", directTicker: "ETH-USD", aliases: ["ethereum", "eth"] },
  { symbol: "SOL", name: "Solana (USD)", exchange: "CRYPTO", directTicker: "SOL-USD", aliases: ["solana", "sol"] },
];

/** Common words that look uppercase or ticker-like but are NOT stock symbols. */
const STOP_TICKERS = new Set([
  "NSE", "BSE", "MSE", "MSEI", "SEBI", "RBI", "INR", "USD", "EUR", "GBP", "LTP", "PE", "PB", "EPS", "ROE", "ROCE",
  "IPO", "ETF", "SIP", "FII", "DII", "GDP", "CPI", "WPI", "GST", "ITR", "EMI", "RERA", "MCX", "NCDEX", "US", "UK",
  "AI", "IT", "TV", "PC", "PS5", "IPL", "ICC", "BCCI", "UCL", "NBA", "NFL", "F1", "JEE", "NEET", "UPSC", "GATE",
  "CAT", "CUET", "CBSE", "ICSE", "TODAY", "PRICE", "PRICES", "STOCK", "STOCKS", "SHARE", "SHARES", "CHECK", "GIVE",
  "INFO", "DETAIL", "DETAILS", "SINGLE", "ALL", "AND", "OR", "VS", "THE", "FOR", "WITH", "FROM", "ABOUT", "WHAT",
  "HOW", "SHOW", "TELL", "ME", "OF", "ON", "IN", "TO", "IS", "ARE", "HIGH", "LOW", "BUY", "SELL", "HOLD", "MARKET",
  "BRIEF", "NEWS", "LIVE", "RATE", "RATES", "DAILY", "REPORT", "COMPARE", "ANALYSIS", "FULL", "QUICK", "JUST",
]);

/** Detects which Indian exchanges the user explicitly asked for. */
export function detectRequestedExchanges(query: string): { exchanges: Array<"NSE" | "BSE" | "MSE">; mseMentioned: boolean } {
  const upper = query.toUpperCase();
  const exchanges: Array<"NSE" | "BSE" | "MSE"> = [];
  if (/\bNSE\b/.test(upper) || /\.NS\b/.test(upper)) exchanges.push("NSE");
  if (/\bBSE\b/.test(upper) || /\.BO\b/.test(upper)) exchanges.push("BSE");
  const mseMentioned = /\b(MSE|MSEI|METROPOLITAN STOCK EXCHANGE)\b/.test(upper);
  if (mseMentioned) exchanges.push("MSE");
  return { exchanges, mseMentioned };
}

/** Classifies whether the user wants a quick single quote, side-by-side comparison, broad market overview, or detailed breakdown. */
export function detectMarketDetailLevel(query: string, matchedCount: number): MarketDetailLevel {
  const lower = query.toLowerCase();
  if (/\b(compare|vs\.?|versus|difference between|side[- ]by[- ]side)\b/.test(lower) || matchedCount >= 3) {
    return "compare";
  }
  if (/\b(single|only price|just price|quick price|ltp only|current price only|one[- ]line|brief price)\b/.test(lower)) {
    return "single";
  }
  if (/\b(detail|detailed|full|deep|breakdown|analysis|fundamental|technical|52w|52[- ]week|valuation|pe ratio|market cap|all prices|everything)\b/.test(lower)) {
    return "detailed";
  }
  if (
    matchedCount === 0 &&
    /\b(market|nifty|sensex|indian stocks|indices|index|pre[- ]?market|post[- ]?market|opening|closing|daily brief|watchlist|top gainers|top losers|nse|bse|mse)\b/.test(lower)
  ) {
    return "overview";
  }
  if (matchedCount === 1 && query.trim().split(/\s+/).length <= 5 && /\b(price|ltp|rate|quote|cmp)\b/.test(lower)) {
    return "single";
  }
  return "detailed";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches known Indian stocks, indices, commodities, FX, and crypto mentioned in a user query. */
export function matchKnownInstruments(query: string): KnownInstrument[] {
  const lower = query.toLowerCase();
  const found: KnownInstrument[] = [];
  const seen = new Set<string>();

  for (const inst of KNOWN_INSTRUMENTS) {
    if (seen.has(inst.symbol)) continue;
    for (const alias of inst.aliases) {
      const pattern = new RegExp(`(?:^|[^a-z0-9&])${escapeRegExp(alias)}(?:$|[^a-z0-9&])`, "i");
      if (pattern.test(lower)) {
        seen.add(inst.symbol);
        found.push(inst);
        break;
      }
    }
  }
  return found;
}

/** Extracts explicit uppercase or exchange-suffixed candidate tickers (e.g. "ZOMATO.NS", "TCS.BO", "$INFY", "TRENT") not already matched. */
export function extractCandidateTickers(query: string, alreadyMatched: Set<string>): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>(alreadyMatched);

  // Explicit .NS / .BO / $TICKER patterns
  const explicitRe = /(?:\$([A-Z][A-Z0-9&-]{1,14})|\b([A-Z][A-Z0-9&-]{1,14})\.(NS|BO)\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = explicitRe.exec(query)) !== null) {
    const raw = (m[1] || m[2] || "").toUpperCase();
    const suffix = m[3] ? `.${m[3].toUpperCase()}` : "";
    const key = suffix ? `${raw}${suffix}` : raw;
    if (raw && !STOP_TICKERS.has(raw) && !seen.has(raw) && !seen.has(key)) {
      seen.add(raw);
      candidates.push(key);
    }
  }

  // Standalone uppercase ticker tokens (length 2..12) when user wrote e.g. "Check KPITTECH and CAMS price on NSE"
  const upperRe = /\b([A-Z][A-Z0-9&-]{1,11})\b/g;
  while ((m = upperRe.exec(query)) !== null) {
    const tok = m[1]!;
    if (STOP_TICKERS.has(tok) || seen.has(tok) || /^\d+$/.test(tok)) continue;
    seen.add(tok);
    candidates.push(tok);
  }

  return candidates.slice(0, 5);
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        currency?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        marketState?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketTime?: number;
      };
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

function inferExchangeFromTicker(ticker: string, fallback: MarketExchange = "GLOBAL", exchangeName?: string): MarketExchange {
  if (ticker.endsWith(".NS") || exchangeName?.toUpperCase().includes("NSI") || exchangeName?.toUpperCase().includes("NSE")) return "NSE";
  if (ticker.endsWith(".BO") || exchangeName?.toUpperCase().includes("BSE") || exchangeName?.toUpperCase().includes("BOM")) return "BSE";
  if (ticker.startsWith("^")) return "INDEX";
  if (ticker.endsWith("=F")) return "COMMODITY";
  if (ticker.endsWith("=X")) return "FOREX";
  if (ticker.endsWith("-USD") || ticker.endsWith("-INR")) return "CRYPTO";
  return fallback;
}

/** Pure normalizer for Yahoo Finance v8 chart responses (exported for unit tests). */
export function parseYahooChartQuote(
  raw: YahooChartResponse | null,
  fallbackSymbol: string,
  fallbackName?: string,
  fallbackExchange: MarketExchange = "NSE",
): MarketQuote | null {
  const result = raw?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number" || !Number.isFinite(meta.regularMarketPrice)) {
    return null;
  }

  const ticker = meta.symbol ?? fallbackSymbol;
  const exchange = inferExchangeFromTicker(ticker, fallbackExchange, meta.exchangeName ?? meta.fullExchangeName);
  const price = meta.regularMarketPrice;
  const prevClose =
    typeof meta.previousClose === "number" && Number.isFinite(meta.previousClose)
      ? meta.previousClose
      : typeof meta.chartPreviousClose === "number" && Number.isFinite(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : null;
  const change = prevClose !== null ? Number((price - prevClose).toFixed(4)) : null;
  const changePercent = prevClose !== null && prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : null;

  const quoteSeries = result?.indicators?.quote?.[0];
  const lastNonNull = (arr?: Array<number | null>): number | null => {
    if (!arr?.length) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr[i];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };

  const open = lastNonNull(quoteSeries?.open);
  const dayHigh =
    typeof meta.regularMarketDayHigh === "number" && Number.isFinite(meta.regularMarketDayHigh)
      ? meta.regularMarketDayHigh
      : lastNonNull(quoteSeries?.high);
  const dayLow =
    typeof meta.regularMarketDayLow === "number" && Number.isFinite(meta.regularMarketDayLow)
      ? meta.regularMarketDayLow
      : lastNonNull(quoteSeries?.low);
  const volume =
    typeof meta.regularMarketVolume === "number" && Number.isFinite(meta.regularMarketVolume)
      ? meta.regularMarketVolume
      : lastNonNull(quoteSeries?.volume);

  const cleanSymbol = fallbackSymbol.replace(/\.(NS|BO)$/i, "");
  const ts =
    typeof meta.regularMarketTime === "number" && meta.regularMarketTime > 0
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

  const sourceUrl =
    exchange === "NSE"
      ? `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(cleanSymbol)}`
      : exchange === "BSE"
        ? `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
        : `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;

  return {
    symbol: cleanSymbol,
    ticker,
    name: meta.longName || meta.shortName || fallbackName || cleanSymbol,
    exchange,
    currency: meta.currency || (exchange === "NSE" || exchange === "BSE" || ticker === "^NSEI" || ticker === "^BSESN" ? "INR" : "USD"),
    price,
    previousClose: prevClose,
    change,
    changePercent,
    open,
    dayHigh,
    dayLow,
    fiftyTwoWeekHigh: typeof meta.fiftyTwoWeekHigh === "number" && Number.isFinite(meta.fiftyTwoWeekHigh) ? meta.fiftyTwoWeekHigh : null,
    fiftyTwoWeekLow: typeof meta.fiftyTwoWeekLow === "number" && Number.isFinite(meta.fiftyTwoWeekLow) ? meta.fiftyTwoWeekLow : null,
    volume,
    marketState: meta.marketState,
    timestamp: ts,
    sourceName: exchange === "NSE" ? "NSE Live Feed" : exchange === "BSE" ? "BSE Live Feed" : "Market Feed",
    sourceUrl,
  };
}

async function fetchYahooChart(ticker: string, fallbackSymbol: string, fallbackName?: string, fallbackExchange: MarketExchange = "NSE"): Promise<MarketQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    return parseYahooChartQuote(json, fallbackSymbol, fallbackName, fallbackExchange);
  } catch {
    return null;
  }
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
  }>;
}

/** Dynamically resolves an Indian stock name or company phrase (e.g. "Varun Beverages" -> VBL.NS / VBL.BO) via Yahoo Finance search. */
async function resolveDynamicIndianTicker(query: string): Promise<Array<{ ticker: string; symbol: string; name: string; exchange: MarketExchange }>> {
  const cleaned = query
    .replace(/\b(nse|bse|mse|msei|stock|stocks|share|shares|price|prices|quote|today|live|check|give|me|detailed|detail|single|info|information|analysis|compare|vs|latest|on|in|of|the|for|what|is|are)\b/gi, " ")
    .replace(/[^a-zA-Z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 60) return [];

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleaned)}&quotesCount=6&newsCount=0`,
      {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(3_500),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as YahooSearchResponse;
    const indian = (data.quotes ?? []).filter(
      (q) =>
        q.symbol &&
        (q.symbol.endsWith(".NS") || q.symbol.endsWith(".BO") || q.exchange === "NSI" || q.exchange === "BSE" || q.exchange === "BOM"),
    );
    const picked = indian.length > 0 ? indian.slice(0, 2) : (data.quotes ?? []).filter((q) => q.symbol && q.quoteType === "EQUITY").slice(0, 1);
    return picked.map((q) => ({
      ticker: q.symbol!,
      symbol: q.symbol!.replace(/\.(NS|BO)$/i, ""),
      name: q.longname || q.shortname || q.symbol!,
      exchange: inferExchangeFromTicker(q.symbol!, "NSE", q.exchange),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches live NSE, BSE, Index, Commodity, Forex & Crypto quotes for any natural-language prompt.
 * Never throws: returns a partial or empty snapshot gracefully so web search + LLM always respond.
 */
export async function fetchLiveMarketSnapshot(rawQuery: string): Promise<MarketSnapshot> {
  const query = rawQuery.trim().slice(0, 300);
  const { exchanges, mseMentioned } = detectRequestedExchanges(query);
  const known = matchKnownInstruments(query);
  const matchedSymbols = new Set(known.map((k) => k.symbol));
  const extraCandidates = extractCandidateTickers(query, matchedSymbols);
  const detailLevel = detectMarketDetailLevel(query, known.length + extraCandidates.length);
  const notes: string[] = [];

  const tasks: Array<Promise<MarketQuote | null>> = [];
  const queuedTickers = new Set<string>();
  const enqueue = (ticker: string, symbol: string, name?: string, exchange: MarketExchange = "NSE") => {
    const key = ticker.toUpperCase();
    if (queuedTickers.has(key) || tasks.length >= 8) return;
    queuedTickers.add(key);
    tasks.push(fetchYahooChart(ticker, symbol, name, exchange));
  };

  const wantNse = exchanges.length === 0 || exchanges.includes("NSE") || (exchanges.includes("MSE") && !exchanges.includes("BSE"));
  const wantBse = exchanges.includes("BSE") || (detailLevel === "detailed" && exchanges.length === 0 && known.length <= 2);

  // 1. Queue known instruments matched directly from query
  for (const inst of known.slice(0, 5)) {
    if (inst.directTicker) {
      enqueue(inst.directTicker, inst.symbol, inst.name, inst.exchange);
      continue;
    }
    if (wantNse && inst.nseTicker) enqueue(inst.nseTicker, inst.symbol, inst.name, "NSE");
    if (wantBse && inst.bseTicker) enqueue(inst.bseTicker, inst.symbol, inst.name, "BSE");
    if (!wantNse && !wantBse && inst.nseTicker) enqueue(inst.nseTicker, inst.symbol, inst.name, "NSE");
  }

  // 2. Queue explicit uppercase / .NS / .BO candidate tickers
  for (const cand of extraCandidates.slice(0, 3)) {
    if (cand.endsWith(".NS") || cand.endsWith(".BO")) {
      enqueue(cand, cand.replace(/\.(NS|BO)$/i, ""), undefined, cand.endsWith(".BO") ? "BSE" : "NSE");
    } else {
      if (wantNse) enqueue(`${cand}.NS`, cand, undefined, "NSE");
      if (wantBse) enqueue(`${cand}.BO`, cand, undefined, "BSE");
    }
  }

  // 3. If it's a broad Indian market overview/briefing with no individual stock matched, fetch benchmark indices!
  if (tasks.length === 0 && detailLevel === "overview") {
    enqueue("^NSEI", "NIFTY 50", "NIFTY 50 (NSE)", "INDEX");
    enqueue("^BSESN", "SENSEX", "BSE SENSEX", "INDEX");
    enqueue("^NSEBANK", "BANK NIFTY", "NIFTY Bank", "INDEX");
    enqueue("^INDIAVIX", "INDIA VIX", "India VIX", "INDEX");
    if (/\b(gold|commodity|commodities|forex|dollar|rupee|macro)\b/i.test(query)) {
      enqueue("INR=X", "USD/INR", "USD / INR Exchange Rate", "FOREX");
      enqueue("GC=F", "GOLD", "Gold Futures", "COMMODITY");
    }
  }

  // 4. If still no tickers matched (e.g., user typed a less-known Indian company name like "Varun Beverages" or "CAMS"), dynamically resolve via search!
  if (tasks.length === 0) {
    const resolved = await resolveDynamicIndianTicker(query);
    for (const r of resolved) {
      enqueue(r.ticker, r.symbol, r.name, r.exchange);
      // If user asked for both NSE and BSE, also fetch the paired Indian exchange ticker!
      if (r.ticker.endsWith(".NS") && wantBse) {
        enqueue(`${r.symbol}.BO`, r.symbol, r.name, "BSE");
      } else if (r.ticker.endsWith(".BO") && wantNse) {
        enqueue(`${r.symbol}.NS`, r.symbol, r.name, "NSE");
      }
    }
  }

  const settled = await Promise.all(tasks);
  const quotes = settled.filter((q): q is MarketQuote => q !== null);

  if (mseMentioned) {
    notes.push(
      "MSE (Metropolitan Stock Exchange of India) equity listings & updates are cross-checked via live web search alongside NSE/BSE market quotes.",
    );
  }
  if (quotes.length === 0 && (known.length > 0 || extraCandidates.length > 0)) {
    notes.push("Direct exchange tick feed did not return a quote for the exact ticker; falling back to live web search sources.");
  }

  return {
    query,
    detailLevel,
    requestedExchanges: exchanges.length ? exchanges : ["NSE", "BSE"],
    quotes,
    mseMentioned,
    fetchedAt: new Date().toISOString(),
    notes,
  };
}
