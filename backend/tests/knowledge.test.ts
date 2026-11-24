import { describe, it } from "node:test";
import { expect } from "./expect";
import { buildSystemPrompt, DEFAULT_TOOLS, type AgentConfig } from "../src/server/ai/agent";
import { chunkText } from "../src/server/knowledge/chunk";
import { htmlToText, kindFromFilename } from "../src/server/knowledge/extract";
import { keywordQuery } from "../src/server/knowledge/query";

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


