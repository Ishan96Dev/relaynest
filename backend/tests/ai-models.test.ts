import { describe, it } from "node:test";
import { expect } from "./expect";
import { createAiAgentInput, modelSlug, telegramBotUsername } from "../src/lib/validation/schemas";
import { MODEL_CATALOG } from "../src/server/ai/model-catalog";

describe("model catalog seed", () => {
  it("has unique, valid slugs and API ids", () => {
    const slugs = MODEL_CATALOG.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(MODEL_CATALOG.map((m) => m.apiModelId)).size).toBe(MODEL_CATALOG.length);
    for (const s of slugs) expect(modelSlug.safeParse(s).success).toBe(true);
  });

  it("only uses values the database constraints allow", () => {
    for (const m of MODEL_CATALOG) {
      expect(["nvidia", "vercel"]).toContain(m.source);
      expect(["chat", "multimodal", "embedding", "image_generation", "evaluation"]).toContain(m.modelType);
      expect(m.inputModalities.length > 0).toBe(true);
      expect(m.outputModalities.length > 0).toBe(true);
    }
  });
});

describe("AI agent input", () => {
  const valid = { name: "RelayNest Assistant", username: "relaynest_assistant_bot", description: "Answers community questions." };

  it("accepts a valid draft and applies defaults", () => {
    const r = createAiAgentInput.parse(valid);
    expect(r.language).toBe("English");
    expect(r.category).toBe("Community Manager");
  });

  it("requires a username that ends in bot", () => {
    expect(telegramBotUsername.safeParse("relaynest_assistant").success).toBe(false);
    expect(telegramBotUsername.safeParse("a_bot").success).toBe(false);
    expect(telegramBotUsername.safeParse("RelayNestBot").success).toBe(true);
    expect(createAiAgentInput.safeParse({ ...valid, username: "bad name_bot" }).success).toBe(false);
  });

  it("limits the description to 300 characters", () => {
    expect(createAiAgentInput.safeParse({ ...valid, description: "x".repeat(301) }).success).toBe(false);
    expect(createAiAgentInput.safeParse({ ...valid, description: "x".repeat(300) }).success).toBe(true);
  });
});
