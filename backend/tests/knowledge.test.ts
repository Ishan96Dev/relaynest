import { describe, it } from "node:test";
import { expect } from "./expect";
import { buildCitationSources, buildSystemPrompt, DEFAULT_TOOLS, type AgentConfig } from "../src/server/ai/agent";
import { extractCitedIndices, formatTelegramHtmlReply, formatTelegramPlainReply, orderSourcesByCitation } from "../src/server/ai/citations";
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
});


