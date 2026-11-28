import { describe, it } from "node:test";
import { expect } from "./expect";
import { buildSystemPrompt, clampReply, DEFAULT_TOOLS, parseTools, type AgentConfig } from "../src/server/ai/agent";
import {
  canPowerAgent,
  computeReasoningBudget,
  DEEP_THINKING_DEFAULT_TOKENS,
  executionMode,
  MODEL_CATALOG,
  PROVIDER_CATALOG,
  recommendedMaxTokens,
  supportsImageInput,
  supportsReasoningBudget,
} from "../src/server/ai/model-catalog";
import {
  base64ToBytes,
  cleanRawImagePrompt,
  generateImage,
  hasImageFilterRisk,
  isFilteredOrBlankImage,
  pickImageDimensions,
  sniffImageMime,
  stripThinkTags,
  ThinkStreamParser,
} from "../src/server/ai/provider";
import { __setTestCloudflareBindings } from "../src/server/cloudflare/bindings";
import { clearModelRegistryCache, getDbDefaultImageModel, getDbImageModels, resolveModelFromDb } from "../src/server/services/ai-models";
import { diffAiAgentUpdate, type AiAgentDto } from "../src/server/services/ai-agents";
import { updateAiAgentInput, updateBotInput } from "../src/lib/validation/schemas";

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
    expect(ids).toContain("nemotron-3-5-super-vl-120b-a12b");
    expect(ids).toContain("nemotron-3-5-bolt-e4b");
    expect(ids).not.toContain("paligemma");
    expect(ids).not.toContain("nemotron-3-embed-1b");
    expect(ids).not.toContain("cosmos3-nano");
  });

  it("detects multimodal image-input models and resolves inactive models via catalog/DB fallback metadata", async () => {
    const by = (slug: string) => MODEL_CATALOG.find((m) => m.slug === slug)!;
    expect(supportsImageInput(by("nemotron-3-5-super-vl-120b-a12b"))).toBe(true);
    expect(supportsImageInput(by("nemotron-3-5-lightning-30b-a3b"))).toBe(false);
    expect(PROVIDER_CATALOG.map((p) => p.source)).toEqual(["nvidia", "vercel"]);
    expect(by("nemotron-3-embed-1b").apiModelId).toBe("nvidia/nemotron-3.5-embed-1b");
    expect(by("gemma-4-31b-it").isActive).toBe(false);
    expect(by("gemma-4-31b-it").fallbackModelSlug).toBe("nemotron-3-5-super-vl-120b-a12b");
    const resolved = await resolveModelFromDb({ slug: "gemma-4-31b-it", source: "nvidia", apiModelId: "google/gemma-4-31b-it" });
    expect(resolved.model.slug).toBe("nemotron-3-5-super-vl-120b-a12b");
    expect(resolved.provider.chatBaseUrl).toContain("integrate.api.nvidia.com");

    // Legacy FLUX.1 Schnell and Cosmos3 Nano transparently route to active FLUX 3 Image Klein, backed by FLUX.2 Klein 4B.
    expect(by("flux-3-image-klein").isActive).toBe(true);
    expect(by("flux-2-klein-4b").isActive).toBe(true);
    expect(by("flux-1-schnell").isActive).toBe(false);
    expect(by("cosmos3-nano").isActive).toBe(false);
    const resolvedFlux1 = await resolveModelFromDb({ slug: "flux-1-schnell", source: "nvidia", apiModelId: "black-forest-labs/flux.1-schnell" });
    expect(resolvedFlux1.model.slug).toBe("flux-3-image-klein");
    const activeImg = await getDbImageModels();
    expect(activeImg.map((m) => m.slug)).toEqual(["flux-3-image-klein", "flux-2-klein-4b"]);
    expect((await getDbDefaultImageModel())?.slug).toBe("flux-3-image-klein");

    expect(stripThinkTags("<think>internal plan</think>\nFinal answer.")).toBe("Final answer.");
    expect(sniffImageMime("iVBORw0KGgo")).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImageMime("/9j/4AAQ")).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(base64ToBytes("SGk=").length).toBe(2);
  });

  it("recovers via Cloudflare Workers AI edge FLUX when upstream image API key is absent or unavailable", async () => {
    clearModelRegistryCache();
    const prevKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    const fakeJpegBase64 = "/9j/" + "A".repeat(18_000);
    const aiCalls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
    __setTestCloudflareBindings({
      AI: {
        async run(model, inputs) {
          aiCalls.push({ model, inputs });
          return { image: fakeJpegBase64 };
        },
      },
    });
    try {
      const res = await generateImage(
        { slug: "flux-1-schnell", source: "nvidia", apiModelId: "black-forest-labs/flux.1-schnell" },
        "a red fox in snow",
        { maxBudgetMs: 15_000, attemptTimeoutMs: 6_000 },
      );
      expect(res.imageBase64).toBe(fakeJpegBase64);
      expect(res.usedFallback).toBe(true);
      expect(res.modelUsed).toBe("@cf/black-forest-labs/flux-1-schnell");
      expect(aiCalls.length).toBe(1);
    } finally {
      __setTestCloudflareBindings(undefined);
      if (prevKey !== undefined) process.env.NVIDIA_API_KEY = prevKey;
    }
  });

  it("guards against CONTENT_FILTERED black frames, cleans image prompts, and picks aspect dimensions", () => {
    expect(isFilteredOrBlankImage({ artifacts: [{ finishReason: "CONTENT_FILTERED", base64: "/9j/" + "A".repeat(20_000) }] }, "/9j/" + "A".repeat(20_000)).blocked).toBe(true);
    expect(isFilteredOrBlankImage({ artifacts: [{ finishReason: "SUCCESS" }] }, "/9j/" + "A".repeat(8_000)).blocked).toBe(true);
    expect(isFilteredOrBlankImage({ artifacts: [{ finishReason: "SUCCESS" }] }, "/9j/" + "A".repeat(25_000)).blocked).toBe(false);
    expect(cleanRawImagePrompt("Generate iPhone Image")).toBe("iPhone");
    expect(cleanRawImagePrompt("Please create an hd photo of a red fox")).toBe("a red fox");
    expect(pickImageDimensions("A wide cinematic landscape banner")).toEqual({ width: 1280, height: 768 });
    expect(pickImageDimensions("Vertical phone wallpaper poster")).toEqual({ width: 896, height: 1152 });
    expect(pickImageDimensions("A studio portrait of a ceramic vase")).toEqual({ width: 896, height: 1152 });
    expect(pickImageDimensions("A red fox in snow")).toEqual({ width: 1024, height: 1024 });
    expect(hasImageFilterRisk("goku")).toBe(true);
    expect(hasImageFilterRisk("A cinematic poster of Spider-Man swinging over New York")).toBe(true);
    expect(hasImageFilterRisk("Generate iPhone 17 studio shot")).toBe(true);
    expect(hasImageFilterRisk("A red fox sitting in a snowy pine forest at sunrise")).toBe(false);
  });

  it("dynamically scales Deep Thinking token budgets and splits chunk-boundary <think> tags safely", () => {
    const lightning = MODEL_CATALOG.find((m) => m.slug === "nemotron-3-5-lightning-30b-a3b")!;
    const mistral = MODEL_CATALOG.find((m) => m.slug === "mistral-large-4-1t-a52b")!;
    const paligemma = MODEL_CATALOG.find((m) => m.slug === "paligemma")!;

    expect(recommendedMaxTokens(lightning, false)).toBe(lightning.defaultMaxTokens);
    expect(recommendedMaxTokens(lightning, true)).toBe(DEEP_THINKING_DEFAULT_TOKENS);
    expect(recommendedMaxTokens(paligemma, true)).toBe(paligemma.defaultMaxTokens);
    expect(computeReasoningBudget(8192)).toBe(2048);
    expect(computeReasoningBudget(4096)).toBe(1024);
    expect(supportsReasoningBudget(lightning)).toBe(true);
    expect(supportsReasoningBudget(mistral)).toBe(false);

    expect(stripThinkTags("<think>unclosed reasoning trace")).toBe("");
    expect(stripThinkTags("Prefix <think>hidden</think> Answer")).toBe("Prefix  Answer");

    // Simulate SSE tokens splitting both <think> and </think> across chunk boundaries.
    const parser = new ThinkStreamParser();
    const chunks = ["<th", "ink>Step 1: check ", "facts.</t", "hink>Final **answer**!"];
    let thought = "";
    let answer = "";
    for (const c of chunks) {
      const part = parser.push(c);
      thought += part.thinking;
      answer += part.answer;
    }
    const tail = parser.flush();
    thought += tail.thinking;
    answer += tail.answer;
    expect(thought).toBe("Step 1: check facts.");
    expect(answer).toBe("Final **answer**!");
  });
});

describe("agent update input", () => {
  it("needs at least one field and validates ranges", () => {
    expect(updateAiAgentInput.safeParse({}).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ silent: true }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ silent: true, notifySummary: true }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ temperature: 1.5 }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ maxTokens: 32 }).success).toBe(false);
    expect(updateAiAgentInput.safeParse({ temperature: 0.2, maxTokens: 512, memoryTurns: 10 }).success).toBe(true);
    expect(updateAiAgentInput.safeParse({ name: "ISH-BOT", silent: true }).success).toBe(true);
    expect(updateAiAgentInput.safeParse({ welcomeMessage: "a".repeat(2500), fallbackMessage: "b".repeat(2500) }).success).toBe(true);
    expect(updateAiAgentInput.safeParse({ welcomeMessage: "a".repeat(4097) }).success).toBe(false);
    expect(updateBotInput.safeParse({ description: "d".repeat(300), category: "c".repeat(60) }).success).toBe(true);
    expect(updateBotInput.safeParse({ description: "d".repeat(301) }).success).toBe(false);
  });

  it("diffs agent updates accurately so unchanged step saves do not trigger redundant bot syncs or notifications", () => {
    const existing: AiAgentDto = {
      id: "agent-1",
      name: "ISH-BOT",
      username: "ish_bot",
      description: "Test bot",
      avatarPath: null,
      language: "English",
      category: "Entertainment",
      modelSlug: "nemotron-3-5-lightning-30b-a3b",
      modelName: "Nemotron 3.5 Lightning 30B",
      imageModelSlug: null,
      imageModelName: null,
      commands: [],
      instructions: "Be helpful and concise.",
      welcomeMessage: "Hello!",
      fallbackMessage: "Try again.",
      temperature: 0.5,
      maxTokens: 1024,
      memoryTurns: 10,
      tools: DEFAULT_TOOLS,
      botId: "bot-1",
      status: "active",
      createdAt: "2026-11-26T00:00:00Z",
      updatedAt: "2026-11-27T00:00:00Z",
    };

    // Re-submitting identical values produces zero changes.
    expect(
      diffAiAgentUpdate(existing, {
        name: "ISH-BOT",
        description: "Test bot",
        category: "Entertainment",
        language: "English",
        modelSlug: "nemotron-3-5-lightning-30b-a3b",
        imageModelSlug: null,
        commands: [],
        instructions: "Be helpful and concise.",
        welcomeMessage: "Hello!",
        fallbackMessage: "Try again.",
        temperature: 0.5,
        maxTokens: 1024,
        memoryTurns: 10,
        tools: DEFAULT_TOOLS,
      }),
    ).toEqual({
      botFieldsChanged: false,
      commandsOrToolsChanged: false,
      commandMirrorChanged: false,
      anyChanged: false,
      changedBotFields: { name: false, description: false, avatar: false, responses: false },
    });

    // Changing only AI model/instructions does not trigger botFieldsChanged.
    expect(
      diffAiAgentUpdate(existing, {
        name: "ISH-BOT",
        modelSlug: "kimi-k3-1-pro",
        instructions: "New detailed prompt for users.",
      }),
    ).toEqual({
      botFieldsChanged: false,
      commandsOrToolsChanged: false,
      commandMirrorChanged: false,
      anyChanged: true,
      changedBotFields: { name: false, description: false, avatar: false, responses: false },
    });

    // Changing category triggers botFieldsChanged so bots & ai_agents stay aligned.
    expect(diffAiAgentUpdate(existing, { category: "Customer Support" })).toEqual({
      botFieldsChanged: true,
      commandsOrToolsChanged: false,
      commandMirrorChanged: false,
      anyChanged: true,
      changedBotFields: { name: false, description: false, avatar: false, responses: false },
    });

    // Changing name + welcomeMessage flags Telegram and response sync accurately.
    expect(diffAiAgentUpdate(existing, { name: "ISH-BOT v2", welcomeMessage: "Welcome!" })).toEqual({
      botFieldsChanged: true,
      commandsOrToolsChanged: false,
      commandMirrorChanged: true,
      anyChanged: true,
      changedBotFields: { name: true, description: false, avatar: false, responses: true },
    });

    // Changing tools triggers command sync without bot profile sync.
    expect(diffAiAgentUpdate(existing, { tools: { ...DEFAULT_TOOLS, webSearch: false } })).toEqual({
      botFieldsChanged: false,
      commandsOrToolsChanged: true,
      commandMirrorChanged: true,
      anyChanged: true,
      changedBotFields: { name: false, description: false, avatar: false, responses: false },
    });
  });
});
