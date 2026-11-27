import "server-only";
import { planAgenticExecution, type AgenticPlan, type AgenticPlanInput } from "@backend/server/ai/agentic";
import type { CitationSource } from "@backend/server/ai/citations";
import {
  buildMarketSystemContext,
  marketQuotesToCitations,
  type AgenticPayload,
  type AgenticStepEvent,
  type MarketSnapshot,
} from "@backend/server/ai/market-data-types";
import {
  buildWebSearchSystemContext,
  type SearchProviderChoice,
  webSearchToCitations,
  type WebMediaPayload,
  type WebSearchBundle,
} from "@backend/server/ai/web-search-types";
import { fetchLiveMarketSnapshot } from "@backend/server/search/market-data";
import { searchOpenWeb } from "@backend/server/search/web-search";
import type { ExecutionTracer } from "@backend/server/services/execution-trace";

export interface RunAgenticToolsOptions extends AgenticPlanInput {
  searchProvider?: SearchProviderChoice;
  /** 1-based index where newly collected citations should begin (after KB/Agent Knowledge citations). */
  citationStartIndex?: number;
  maxResults?: number;
  maxImages?: number;
  maxVideos?: number;
  /** Optional real-time callback for Playground SSE streaming. */
  onStep?: (step: AgenticStepEvent) => void;
  /** Optional Telegram execution tracer for /executions observability. */
  tracer?: ExecutionTracer;
}

export interface AgenticToolsOutcome {
  plan: AgenticPlan;
  steps: AgenticStepEvent[];
  marketSnapshot: MarketSnapshot | null;
  webBundle: WebSearchBundle | null;
  citations: CitationSource[];
  webMedia?: WebMediaPayload;
  /** Ready-to-append grounded system context (market quotes + web results). */
  systemContext: string;
  /** Compact payload forwarded to Playground UI for tool trace + ticker strip rendering. */
  agenticPayload?: AgenticPayload;
}

/**
 * Executes all planned live agentic tools (NSE/BSE/MSE Market Feed + Open Web Search) concurrently,
 * emitting live progress events and returning unified citations, media, and grounded system context.
 */
export async function runAgenticTools(opts: RunAgenticToolsOptions): Promise<AgenticToolsOutcome> {
  const plan = planAgenticExecution(opts);
  const steps: AgenticStepEvent[] = [];

  if (!plan.shouldFetchMarket && !plan.shouldSearchWeb) {
    return {
      plan,
      steps,
      marketSnapshot: null,
      webBundle: null,
      citations: [],
      systemContext: "",
    };
  }

  const recordStep = (ev: AgenticStepEvent) => {
    const idx = steps.findIndex((s) => s.id === ev.id);
    if (idx === -1) steps.push(ev);
    else steps[idx] = ev;
    opts.onStep?.(ev);
  };

  const marketTask = plan.shouldFetchMarket
    ? (async (): Promise<MarketSnapshot | null> => {
        const started = Date.now();
        const id = "tool_market_quotes";
        const label = "Checking live NSE / BSE / MSE market quotes";
        recordStep({ id, tool: "market_quotes", label, status: "running", detail: plan.marketQuery.slice(0, 120) });

        const exec = () => fetchLiveMarketSnapshot(plan.marketQuery);
        const snap = opts.tracer
          ? await opts.tracer.trace(
              "market_quotes",
              "market.quotes",
              { query: plan.marketQuery },
              exec,
              (res) => ({
                quoteCount: res.quotes.length,
                detailLevel: res.detailLevel,
                exchanges: res.requestedExchanges,
                symbols: res.quotes.map((q) => `${q.symbol} (${q.exchange}): ${q.price}`),
              }),
            )
          : await exec();

        const ms = Date.now() - started;
        const summary =
          snap.quotes.length > 0
            ? `${snap.quotes.length} live ${snap.quotes.length === 1 ? "quote" : "quotes"} (${snap.quotes.slice(0, 3).map((q) => `${q.symbol}·${q.exchange}`).join(", ")}${snap.quotes.length > 3 ? "…" : ""})`
            : "No direct ticker match — using live web search";
        recordStep({ id, tool: "market_quotes", label: "Live Market Data (NSE/BSE/MSE)", status: "done", detail: summary, durationMs: ms });
        return snap;
      })()
    : Promise.resolve(null);

  const webTask = plan.shouldSearchWeb && plan.webQuery
    ? (async (): Promise<WebSearchBundle | null> => {
        const started = Date.now();
        const id = "tool_web_search";
        const label = "Searching live web sources";
        recordStep({ id, tool: "web_search", label, status: "running", detail: plan.webQuery.slice(0, 120) });

        const maxResults = opts.maxResults ?? 6;
        const maxImages = plan.lightweightWeb ? 0 : (opts.maxImages ?? 4);
        const maxVideos = plan.lightweightWeb ? 0 : (opts.maxVideos ?? 4);
        const exec = () =>
          searchOpenWeb(plan.webQuery, {
            provider: opts.searchProvider ?? "auto",
            maxResults,
            maxImages,
            maxVideos,
          });

        const bundle = opts.tracer
          ? await opts.tracer.trace(
              "agentic_web_search",
              "web.search",
              { query: plan.webQuery, provider: opts.searchProvider ?? "auto" },
              exec,
              (res) => ({
                engine: res.engine,
                providerSlug: res.providerSlug,
                resultCount: res.results.length,
                imageCount: res.images.length,
                videoCount: res.videos.length,
                topSources: res.results.slice(0, 4).map((r) => `${r.title} (${r.url})`),
              }),
            )
          : await exec();

        const ms = Date.now() - started;
        recordStep({
          id,
          tool: "web_search",
          label: `Web Research (${bundle.engine})`,
          status: "done",
          detail: `${bundle.results.length} ${bundle.results.length === 1 ? "source" : "sources"}${bundle.images.length ? ` · ${bundle.images.length} images` : ""}${bundle.videos.length ? ` · ${bundle.videos.length} videos` : ""}`,
          durationMs: ms,
        });
        return bundle;
      })()
    : Promise.resolve(null);

  const [marketSnapshot, webBundle] = await Promise.all([marketTask, webTask]);

  const citations: CitationSource[] = [];
  const contextBlocks: string[] = [];
  let nextIdx = opts.citationStartIndex ?? 1;

  if (marketSnapshot) {
    const marketCites = marketQuotesToCitations(marketSnapshot.quotes, nextIdx);
    citations.push(...marketCites);
    contextBlocks.push(buildMarketSystemContext(marketSnapshot, nextIdx));
    nextIdx += marketCites.length;
  }

  let webMedia: WebMediaPayload | undefined;
  if (webBundle) {
    const webCites = webSearchToCitations(webBundle.results, nextIdx);
    citations.push(...webCites);
    contextBlocks.push(buildWebSearchSystemContext(webBundle, nextIdx));
    webMedia = {
      query: webBundle.query,
      engine: webBundle.engine,
      providerSlug: webBundle.providerSlug,
      images: webBundle.images,
      videos: webBundle.videos,
    };
  }

  const agenticPayload: AgenticPayload | undefined =
    steps.length > 0
      ? {
          steps,
          ...(marketSnapshot?.quotes.length ? { marketQuotes: marketSnapshot.quotes } : {}),
          ...(marketSnapshot ? { detailLevel: marketSnapshot.detailLevel, exchanges: marketSnapshot.requestedExchanges } : {}),
        }
      : undefined;

  return {
    plan,
    steps,
    marketSnapshot,
    webBundle,
    citations,
    webMedia,
    systemContext: contextBlocks.join("\n\n"),
    agenticPayload,
  };
}
