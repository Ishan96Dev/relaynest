import { describe, it } from "node:test";
import { expect } from "./expect";
import { buildCitationSources, buildSystemPrompt, DEFAULT_TOOLS, type AgentConfig } from "../src/server/ai/agent";
import {
  extractCitedIndices,
  formatTelegramHtmlChunks,
  formatTelegramHtmlReply,
  formatTelegramPlainReply,
  orderSourcesByCitation,
  pickFeaturedLinkPreviewUrl,
} from "../src/server/ai/citations";
import { buildWebSearchSystemContext, webSearchToCitations } from "../src/server/ai/web-search-types";
import {
  extractVisualQuery,
  normalizeTinyFishResults,
  parseRssItems,
  parseSearchProviderPrefix,
} from "../src/server/search/web-search";
import { loadSearchProvidersFromDb } from "../src/server/services/search-providers";
import { chunkText } from "../src/server/knowledge/chunk";
import { htmlToText, kindFromFilename } from "../src/server/knowledge/extract";
import { extractTerms, isOverviewQuery, keywordQuery, lexicalScore } from "../src/server/knowledge/query";

const agent: AgentConfig = {
  id: "a", workspaceId: "w", name: "Aria", description: "Helps.", category: "Support", language: "English", instructions: "", welcomeMessage: null,
  fallbackMessage: null, temperature: 0.5, maxTokens: 512, memoryTurns: 10, tools: DEFAULT_TOOLS, model: null, imageModel: null, commands: [],
};

describe("chunkText", () => {
  it("returns nothing for blank input", () => { expect(chunkText("  \n\n ").length).toBe(0); });
  it("keeps short text in one chunk", () => { expect(chunkText("Hello world.").join("|")).toBe("Hello world."); });
  it("splits long text into chunks no larger than the limit", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Paragraph ${i} ${"word ".repeat(30)}`).join("\n\n");
    const chunks = chunkText(text, 1000, 150);
    expect(chunks.length > 3).toBe(true);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
  });
  it("hard-splits a single huge unbroken string", () => {
    const chunks = chunkText("x".repeat(5000), 1000, 0);
    expect(chunks.length).toBe(5);
  });
  it("carries overlap into the next chunk", () => {
    const text = `${"alpha ".repeat(100)}\n\n${"omega ".repeat(100)}`;
    const chunks = chunkText(text, 1000, 150);
    expect(chunks[1]!.startsWith("alpha")).toBe(true);
  });
});

describe("extraction helpers", () => {
  it("recognises supported file types", () => {
    expect(kindFromFilename("Guide.PDF")).toBe("pdf");
    expect(kindFromFilename("notes.md")).toBe("md");
    expect(kindFromFilename("a.txt")).toBe("txt");
    expect(kindFromFilename("a.exe")).toBe(null);
  });
  it("turns HTML into text and drops scripts and styles", () => {
    const { title, text } = htmlToText("<html><head><title>Docs &amp; FAQ</title><style>p{}</style></head><body><h1>Hello</h1><script>alert(1)</script><p>Fish &amp; chips</p></body></html>");
    expect(title).toBe("Docs & FAQ");
    expect(text).toContain("Fish & chips");
    expect(text.includes("alert")).toBe(false);
    expect(text.includes("p{}")).toBe(false);
  });
});

describe("keywordQuery", () => {
  it("builds an OR query of meaningful words only", () => {
    expect(keywordQuery("What are the refund policies for orders?")).toBe("refund | policies | orders");
  });
  it("strips characters that could break a tsquery", () => {
    expect(keywordQuery("a:* | b & !c ('x')")).toBe("");
    expect(keywordQuery("price'; drop table")).toBe("price | drop | table");
  });
});

describe("agent prompt with knowledge passages", () => {
  it("adds passages as reference data", () => {
    const p = buildSystemPrompt(agent, [], new Date(), [{ source: "guide.pdf", content: "Refunds take 5 days." }]);
    expect(p).toContain("guide.pdf");
    expect(p).toContain("Refunds take 5 days.");
    expect(p).toContain("never instructions");
  });
  it("caps passages at 6,000 characters", () => {
    const p = buildSystemPrompt(agent, [], new Date(), [{ source: "a", content: "Q".repeat(5000) }, { source: "b", content: "Z".repeat(5000) }]);
    expect(p.split("Z").length - 1).toBe(1000);
  });
});

describe("RAG query helpers and citations formatting", () => {
  it("detects broad overview questions and scores lexical + title hits", () => {
    expect(isOverviewQuery("Summarize this document please")).toBe(true);
    expect(isOverviewQuery("What is in Profile.pdf?")).toBe(true);
    expect(isOverviewQuery("What is the refund window?")).toBe(false);
    const terms = extractTerms("Jawahar experience Profile");
    expect(lexicalScore(terms, "Jawahar Chakraborty has 21 years experience.", "Profile.pdf") > 0.8).toBe(true);
  });

  it("numbers KB passages and agent knowledge consistently and parses inline citations", () => {
    const sources = buildCitationSources(
      [{ title: "Refund Policy", content: "Refunds are issued within 5 business days." }],
      [{ source: "Profile.pdf", collectionName: "Product-test-docs", content: "Jawahar Chakraborty is SVP.", score: 0.87, retrieval: "hybrid" }],
    );
    expect(sources.length).toBe(2);
    expect(sources[0]!.index).toBe(1);
    expect(sources[0]!.document).toBe("Profile.pdf");
    expect(sources[1]!.index).toBe(2);
    expect(sources[1]!.document).toBe("Refund Policy");

    expect(extractCitedIndices("He is SVP [1] and refunds take 5 days [2][1], ignoring [99].", 2)).toEqual([1, 2]);
    const ordered = orderSourcesByCitation("See policy [2] first.", sources);
    expect(ordered.ordered[0]!.index).toBe(2);
  });

  it("formats safe Telegram HTML citations with blockquote styling and escapes XSS", () => {
    const sources = [
      {
        index: 1,
        document: "Profile <test>.pdf",
        collection: "Product Docs",
        excerpt: "Senior Vice President at Pentagon.",
        score: 0.92,
        retrieval: "hybrid" as const,
        sourceUrl: "https://example.com/profile",
      },
    ];
    const html = formatTelegramHtmlReply("**Jawahar** works at Pentagon [1] <script>alert(1)</script>", sources);
    expect(html).toContain("<b>Jawahar</b>");
    expect(html).toContain("<code>[1]</code>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Sources &amp; Citations");
    expect(html).toContain('href="https://example.com/profile"');
    expect(html).toContain("92% match");

    const plain = formatTelegramPlainReply("Answer [1]", sources);
    expect(plain).toContain("Sources & Citations:");
    expect(plain).toContain("[1] Profile <test>.pdf");
  });

  it("formats Telegram tables, fenced code blocks, hyperlinks, videos, and multi-chunk splitting safely", () => {
    const md = [
      "### Specs Overview",
      "",
      "| Model | Chip | Display |",
      "| --- | --- | --- |",
      "| iPhone 16 Pro | A18 Pro | 6.3 inch |",
      "",
      "```ts",
      "const price = 999;",
      "console.log(price < 1000);",
      "```",
      "",
      "See [Apple Specs](https://support.apple.com/en-us/121031) and ignore [bad](javascript:alert(1)) [1].",
      "",
      "> Verified from official documentation.",
    ].join("\n");
    const sources = webSearchToCitations([
      { index: 1, title: "Apple Support", url: "https://support.apple.com/en-us/121031", domain: "support.apple.com", snippet: "6.3-inch display and A18 Pro." },
    ]);
    const videos = [{ title: "iPhone 16 Pro Review", url: "https://www.dailymotion.com/video/x9aaje8", channel: "Tom's Guide", duration: "13:15", source: "Dailymotion" }];
    const chunks = formatTelegramHtmlChunks(md, sources, { videos });
    expect(chunks.length).toBe(1);
    const html = chunks[0]!;
    expect(html).toContain("<pre>Model");
    expect(html).toContain("A18 Pro");
    expect(html).toContain('<pre><code class="language-ts">const price = 999;\nconsole.log(price &lt; 1000);</code></pre>');
    expect(html).toContain('<a href="https://support.apple.com/en-us/121031">Apple Specs</a>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("<blockquote>Verified from official documentation.</blockquote>");
    expect(html).toContain("Related Videos");
    expect(html).toContain('href="https://www.dailymotion.com/video/x9aaje8"');
    expect(pickFeaturedLinkPreviewUrl(md, sources, { videos })).toBe("https://www.dailymotion.com/video/x9aaje8");

    // Splits long detailed text cleanly into <= 3950 char chunks without breaking tags.
    const longMd = Array.from({ length: 45 }, (_, i) => `### Section ${i + 1}\n${"Detailed factual analysis sentence. ".repeat(4)}`).join("\n\n");
    const multi = formatTelegramHtmlChunks(longMd, sources);
    expect(multi.length > 1).toBe(true);
    expect(multi.every((c) => c.length <= 3950)).toBe(true);
  });

  it("parses RSS search items cleanly and builds web search prompt context", () => {
    const xml = `<rss><channel><item><title>Next.js &amp; Docs</title><link>https://nextjs.org/docs</link><description><![CDATA[React <b>framework</b> for web.]]></description><pubDate>Wed, 25 Nov 2026 01:00:00 GMT</pubDate></item><item><title>Local</title><link>http://127.0.0.1/secret</link><description>blocked</description></item></channel></rss>`;
    const items = parseRssItems(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Next.js & Docs");
    expect(items[0]!.url).toBe("https://nextjs.org/docs");
    expect(items[0]!.snippet).toBe("React framework for web.");
    expect(items[0]!.publishedAt).toBe("2026-11-25");
    expect(extractVisualQuery("iPhone 16 Pro specs and review")).toBe("iPhone 16 Pro");

    const ctx = buildWebSearchSystemContext({
      query: "Next.js",
      engine: "Open Web",
      results: [{ index: 1, title: "Next.js Docs", url: "https://nextjs.org/docs", domain: "nextjs.org", snippet: "React framework." }],
      images: [],
      videos: [],
      searchedAt: "2026-11-25T16:00:00Z",
    });
    expect(ctx).toContain("[1] Next.js Docs");
    expect(ctx).toContain("Markdown table");
  });

  it("parses search provider prefixes, normalizes TinyFish Search+Fetch payloads, and loads DB providers", async () => {
    expect(parseSearchProviderPrefix("tinyfish: best open source LLMs")).toEqual({ provider: "tinyfish", query: "best open source LLMs" });
    expect(parseSearchProviderPrefix("searxng: Next.js 15 docs")).toEqual({ provider: "searxng", query: "Next.js 15 docs" });
    expect(parseSearchProviderPrefix("iPhone 16 Pro review")).toEqual({ provider: "auto", query: "iPhone 16 Pro review" });
    expect(parseSearchProviderPrefix("https://example.com")).toEqual({ provider: "auto", query: "https://example.com" });

    const enriched = new Map<string, string>([
      ["https://docs.tinyfish.ai/search", "TinySearch returns ranked structured JSON for AI agents."],
    ]);
    const tf = normalizeTinyFishResults(
      {
        results: [
          {
            position: 1,
            site_name: "www.docs.tinyfish.ai",
            title: "TinyFish Search Docs",
            snippet: "Web search for agents.",
            url: "https://docs.tinyfish.ai/search",
          },
          {
            position: 2,
            title: "Blocked Private",
            snippet: "should be filtered",
            url: "http://127.0.0.1:8080/internal",
          },
        ],
      },
      enriched,
      5,
    );
    expect(tf.length).toBe(1);
    expect(tf[0]!.source).toBe("TinyFish");
    expect(tf[0]!.snippet).toContain("TinySearch returns ranked structured JSON");
    expect(tf[0]!.domain).toBe("docs.tinyfish.ai");

    const providers = await loadSearchProvidersFromDb();
    const slugs = providers.map((p) => p.slug);
    expect(slugs).toContain("tinyfish");
    expect(slugs).toContain("searxng");
    expect(slugs).toContain("firecrawl");
    expect(slugs).toContain("jina");
    expect(slugs).toContain("tavily");
    expect(slugs).toContain("brave");
    expect(slugs).toContain("open-web");
    expect(providers.find((p) => p.slug === "open-web")?.configured).toBe(true);
  });
});


