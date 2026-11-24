import { describe, it } from "node:test";
import { expect } from "./expect";
import { buildSystemPrompt, clampReply, DEFAULT_TOOLS, parseTools, type AgentConfig } from "../src/server/ai/agent";
import { canPowerAgent, executionMode, MODEL_CATALOG } from "../src/server/ai/model-catalog";
import { updateAiAgentInput } from "../src/lib/validation/schemas";

const agent: AgentConfig = {
  id: "a", workspaceId: "w", name: "Aria", description: "Helps with orders.", category: "Customer Support", language: "English",
  instructions: "Be brief.", welcomeMessage: null, fallbackMessage: null, temperature: 0.5, maxTokens: 512, memoryTurns: 10, tools: DEFAULT_TOOLS, model: null, imageModel: null, commands: [],
};

describe("agent prompt", () => {
  it("includes identity, instructions and the current time when enabled", () => {
    const p = buildSystemPrompt(agent, [], new Date("2026-03-04T05:06:00Z"));
    expect(p).toContain("You are Aria");
    expect(p).toContain("Be brief.");
    expect(p).toContain("2026-03-04 05:06");
  });

  it("leaves the time out when the tool is off", () => {
    const p = buildSystemPrompt({ ...agent, tools: { ...DEFAULT_TOOLS, datetime: false } }, []);
    expect(p).not.toContain("Current date and time");
  });

  it("adds knowledge and caps it at 24,000 characters", () => {
    const p = buildSystemPrompt(agent, [{ title: "Refunds", content: "x".repeat(30000) }, { title: "Late", content: "y" }]);
    expect(p).toContain("## Refunds");
    expect(p).not.toContain("## Late");
    expect(p.length < 26000).toBe(true);
  });

  it("falls back to default tools for bad data and clamps long replies", () => {
    expect(parseTools({ typing: "yes" })).toEqual(DEFAULT_TOOLS);
    expect(clampReply("a".repeat(5000)).length <= 4000).toBe(true);
  });
});

describe("model execution", () => {
  it("maps model types to execution modes", () => {
    const by = (slug: string) => MODEL_CATALOG.find((m) => m.slug === slug)!;
    expect(executionMode(by("nemotron-3-embed-1b"))).toBe("embedding");
    expect(executionMode(by("cosmos3-nano"))).toBe("image");
    expect(executionMode(by("parallel-decisions-fast"))).toBe("decision");
    expect(executionMode(by("gemma-4-31b-it"))).toBe("chat");
  });

  it("only lets chat language models power an agent", () => {
    const ids = MODEL_CATALOG.filter(canPowerAgent).map((m) => m.slug);
    expect(ids).toContain("gemma-4-31b-it");
    expect(ids).not.toContain("paligemma");
    expect(ids).not.toContain("nemotron-3-embed-1b");
    expect(ids).not.toContain("cosmos3-nano");
  });
});

describe("agent update input", () => {
  it("needs at least one field and validates ranges", () => {
    expect(updateAiAgentInput.safeParse({}).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ temperature: 1.5 }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ maxTokens: 32 }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ temperature: 0.2, maxTokens: 512, memoryTurns: 10 }).success).toBe(true);
  });
});
