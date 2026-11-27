import { describe, it } from "node:test";
import { expect } from "./expect";
import { isValidCron, isValidTimezone } from "../src/lib/cron";
import { buildTargetedWebQuery, hasLiveWebIntent, hasMarketIntent, isGreetingOnly, planAgenticExecution } from "../src/server/ai/agentic";
import {
  buildMarketSystemContext,
  formatCompactVolume,
  formatMarketPrice,
  formatSignedChange,
  marketQuotesToCitations,
  type MarketQuote,
} from "../src/server/ai/market-data-types";
import {
  detectMarketDetailLevel,
  detectRequestedExchanges,
  extractCandidateTickers,
  matchKnownInstruments,
  parseYahooChartQuote,
} from "../src/server/search/market-data";
import { executeWorkflow, validateWorkflow, type WorkflowDefinition } from "../src/server/workflow-engine";
import { AGENTIC_TEMPLATES, AGENT_TEMPLATES, findAgentTemplate, parseAgentImport } from "../../frontend/src/lib/agent-templates";

describe("NSE / BSE / MSE market data parser", () => {
  it("detects requested Indian exchanges including NSE, BSE and MSE", () => {
    expect(detectRequestedExchanges("Check TCS on NSE and BSE")).toEqual({ exchanges: ["NSE", "BSE"], mseMentioned: false });
    expect(detectRequestedExchanges("Check RELIANCE across NSE, BSE and MSE")).toEqual({ exchanges: ["NSE", "BSE", "MSE"], mseMentioned: true });
    expect(detectRequestedExchanges("Metropolitan Stock Exchange listings")).toEqual({ exchanges: ["MSE"], mseMentioned: true });
    expect(detectRequestedExchanges("RELIANCE.NS vs RELIANCE.BO")).toEqual({ exchanges: ["NSE", "BSE"], mseMentioned: false });
  });

  it("distinguishes single price vs detailed breakdown vs comparison vs overview", () => {
    expect(detectMarketDetailLevel("single price of RELIANCE", 1)).toBe("single");
    expect(detectMarketDetailLevel("RELIANCE price", 1)).toBe("single");
    expect(detectMarketDetailLevel("Give me detailed info on TCS on NSE and BSE", 1)).toBe("detailed");
    expect(detectMarketDetailLevel("Compare TCS vs INFY on NSE", 2)).toBe("compare");
    expect(detectMarketDetailLevel("Today's Indian stock market overview NSE BSE", 0)).toBe("overview");
  });

  it("matches known Indian equities, indices, commodities, forex & crypto plus custom tickers", () => {
    const m = matchKnownInstruments("Check Reliance, TCS, NIFTY 50, Gold and USD/INR today");
    const syms = m.map((x) => x.symbol);
    expect(syms).toContain("RELIANCE");
    expect(syms).toContain("TCS");
    expect(syms).toContain("NIFTY 50");
    expect(syms).toContain("GOLD");
    expect(syms).toContain("USD/INR");

    const extra = extractCandidateTickers("Check KPITTECH and $CAMS on NSE BSE", new Set(syms));
    expect(extra).toContain("KPITTECH");
    expect(extra).toContain("CAMS");
    expect(extra).not.toContain("NSE");
    expect(extra).not.toContain("BSE");
  });

  it("normalizes Yahoo Finance v8 chart JSON into clean MarketQuote objects and citations", () => {
    const q = parseYahooChartQuote(
      {
        chart: {
          result: [
            {
              meta: {
                symbol: "RELIANCE.NS",
                longName: "Reliance Industries Limited",
                currency: "INR",
                exchangeName: "NSI",
                marketState: "REGULAR",
                regularMarketPrice: 2945.5,
                previousClose: 2900.0,
                regularMarketDayHigh: 2960.0,
                regularMarketDayLow: 2910.25,
                regularMarketVolume: 12500000,
                fiftyTwoWeekHigh: 3217.6,
                fiftyTwoWeekLow: 2220.3,
                regularMarketTime: 1764240000,
              },
              indicators: { quote: [{ open: [2915.0] }] },
            },
          ],
        },
      },
      "RELIANCE",
    );
    expect(Boolean(q)).toBe(true);
    expect(q!.exchange).toBe("NSE");
    expect(q!.price).toBe(2945.5);
    expect(q!.change).toBe(45.5);
    expect(q!.changePercent).toBe(1.57);
    expect(q!.open).toBe(2915);
    expect(formatMarketPrice(q!.price, "INR")).toContain("₹");
    expect(formatSignedChange(q!.change, q!.changePercent)).toBe("+45.50 (+1.57%)");
    expect(formatCompactVolume(q!.volume)).toBe("1.25 Cr");

    const cites = marketQuotesToCitations([q as MarketQuote], 1);
    expect(cites.length).toBe(1);
    expect(cites[0]!.document).toContain("RELIANCE · NSE");

    const singleCtx = buildMarketSystemContext({
      query: "single price of RELIANCE",
      detailLevel: "single",
      requestedExchanges: ["NSE"],
      quotes: [q!],
      mseMentioned: false,
      fetchedAt: "2026-11-28T09:15:00Z",
      notes: [],
    });
    expect(singleCtx).toContain("SINGLE / QUICK QUOTE");
    expect(singleCtx).toContain("2,945.50");

    const detailedCtx = buildMarketSystemContext({
      query: "RELIANCE NSE BSE MSE detailed",
      detailLevel: "detailed",
      requestedExchanges: ["NSE", "BSE", "MSE"],
      quotes: [q!],
      mseMentioned: true,
      fetchedAt: "2026-11-28T09:15:00Z",
      notes: [],
    });
    expect(detailedCtx).toContain("DETAILED MARKET & STOCK ANALYSIS");
    expect(detailedCtx).toContain("Metropolitan Stock Exchange of India");
  });
});

describe("autonomous agentic planner", () => {
  it("skips live search for greetings and activates market + web tools for natural broker queries", () => {
    expect(isGreetingOnly("Hello!")).toBe(true);
    expect(isGreetingOnly("Check RELIANCE on NSE")).toBe(false);
    expect(hasMarketIntent("Check TCS price on NSE and BSE")).toBe(true);
    expect(hasLiveWebIntent("Latest circle rates in Whitefield Bangalore")).toBe(true);

    const greetingPlan = planAgenticExecution({ message: "Hi", autoSearch: true, marketData: true });
    expect(greetingPlan.shouldFetchMarket).toBe(false);
    expect(greetingPlan.shouldSearchWeb).toBe(false);

    const singleStockPlan = planAgenticExecution({ message: "just price of RELIANCE on NSE", autoSearch: true, marketData: true });
    expect(singleStockPlan.shouldFetchMarket).toBe(true);
    expect(singleStockPlan.shouldSearchWeb).toBe(false);

    const detailedStockPlan = planAgenticExecution({
      message: "Go to NSE BSE MSE check TCS detailed stock info",
      autoSearch: true,
      marketData: true,
    });
    expect(detailedStockPlan.shouldFetchMarket).toBe(true);
    expect(detailedStockPlan.shouldSearchWeb).toBe(true);
    expect(detailedStockPlan.webQuery).toContain("MSEI");

    const landPlan = planAgenticExecution({
      message: "Latest land rates per sq.ft in Noida Expressway",
      autoSearch: true,
      marketData: false,
      agentCategory: "Real Estate & Land",
    });
    expect(landPlan.shouldFetchMarket).toBe(false);
    expect(landPlan.shouldSearchWeb).toBe(true);

    const briefPlan = planAgenticExecution({
      message: "",
      command: { command: "brief", kind: "brief", instruction: "Daily NIFTY 50 & SENSEX briefing" },
      autoSearch: true,
      marketData: true,
      agentCategory: "Finance & Markets",
    });
    expect(briefPlan.shouldFetchMarket).toBe(true);
    expect(briefPlan.shouldSearchWeb).toBe(true);
    expect(buildTargetedWebQuery("onion Indore", { marketIntent: false, commandName: "mandi" })).toContain("mandi bhav");
  });
});

describe("role-based agentic AI templates & AI workflow node", () => {
  it("ships rich agentic templates across broker, land, student, sports, gaming & more with valid daily briefings", () => {
    expect(AGENTIC_TEMPLATES.length >= 10).toBe(true);
    expect(AGENT_TEMPLATES.length >= 22).toBe(true);

    const broker = findAgentTemplate("stock-market-broker");
    expect(Boolean(broker)).toBe(true);
    expect(broker!.tools?.autoSearch).toBe(true);
    expect(broker!.tools?.marketData).toBe(true);
    expect((broker!.starterPrompts ?? []).length >= 3).toBe(true);

    for (const id of ["real-estate-land-broker", "student-exam-researcher", "commodities-forex-crypto", "sports-live-analyst", "gaming-esports-intel"]) {
      const tpl = findAgentTemplate(id);
      expect(Boolean(tpl?.isAgentic)).toBe(true);
      expect(tpl!.tools?.autoSearch).toBe(true);
    }

    for (const tpl of AGENTIC_TEMPLATES) {
      if (tpl.dailyBriefing) {
        expect(isValidCron(tpl.dailyBriefing.cron)).toBe(true);
        expect(isValidTimezone(tpl.dailyBriefing.timezone)).toBe(true);
        expect(tpl.dailyBriefing.prompt.length >= 20).toBe(true);
      }
    }

    const imported = parseAgentImport(JSON.stringify({ name: "Broker", tools: { autoSearch: true, marketData: true } }));
    expect(imported.ok && imported.value.tools?.autoSearch).toBe(true);
    expect(imported.ok && imported.value.tools?.marketData).toBe(true);
  });

  it("validates and executes scheduled AI Agent Research -> Telegram briefing workflows", async () => {
    const wf: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: "t1", type: "trigger.schedule", position: { x: 0, y: 0 }, config: { cron: "0 9 * * 1-5", timezone: "Asia/Kolkata" } },
        {
          id: "ai1",
          type: "action.ai.research",
          position: { x: 0, y: 160 },
          config: {
            prompt: "Daily NSE/BSE brief for {{event.watchlist}}",
            category: "Finance & Markets",
            includeWebSearch: true,
            includeMarketData: true,
          },
        },
        {
          id: "tg1",
          type: "action.telegram.sendMessage",
          position: { x: 0, y: 320 },
          config: { botId: "b1", chatIdSource: "configured", chatId: "999", text: "Morning Brief:\n{{ai.text}}" },
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "ai1" },
        { id: "e2", source: "ai1", target: "tg1" },
      ],
    };

    expect(validateWorkflow(wf)).toEqual({ valid: true, issues: [] });

    const sent: string[] = [];
    let researchPrompt = "";
    const res = await executeWorkflow(
      wf,
      { type: "schedule", workspaceId: "w1", source: "schedule", occurredAt: "2026-11-28T03:30:00Z", payload: { watchlist: "RELIANCE, TCS" } },
      {
        runAiResearch: async (input) => {
          researchPrompt = input.prompt;
          return { text: "NIFTY 50: 24,500 (+0.6%) | RELIANCE: ₹2,945", quotesCount: 2, sourcesCount: 4, modelUsed: "nemotron" };
        },
        sendTelegramMessage: async (input) => {
          sent.push(input.text);
          return { externalMessageId: "msg-1" };
        },
        httpRequest: async () => ({ status: 200 }),
      },
    );

    expect(res.status).toBe("succeeded");
    expect(researchPrompt).toBe("Daily NSE/BSE brief for RELIANCE, TCS");
    expect(sent).toEqual(["Morning Brief:\nNIFTY 50: 24,500 (+0.6%) | RELIANCE: ₹2,945"]);
    expect(res.steps.find((s) => s.nodeId === "ai1")?.outputSummary?.quotesCount).toBe(2);
  });
});
