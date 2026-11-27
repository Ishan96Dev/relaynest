import { describe, it } from "node:test";
import { expect } from "./expect";
import { commandTask, imagePrompt, parseCommandText, usageText } from "../src/server/ai/commands";
import { agentCommandSchema, agentCommandsSchema, knowledgeInput } from "../src/lib/validation/schemas";
import { MODEL_CATALOG, executionMode } from "../src/server/ai/model-catalog";
import { AGENT_TEMPLATES, parseAgentImport, templateForModel } from "../../frontend/src/lib/agent-templates";
import {
  getQuickKnowledgeTemplates,
  KNOWLEDGE_SOURCE_TEMPLATES,
} from "../../frontend/src/lib/knowledge-templates";
import {
  getPromptTemplates,
  PLAYGROUND_PROMPT_TEMPLATES,
  TELEGRAM_AGENT_PROMPT_TEMPLATES,
} from "../../frontend/src/lib/prompt-templates";
import {
  AI_AGENT_RESPONSE_TEMPLATES,
  getQuickResponseTemplates,
  getResponseTemplateMatch,
  getResponseTemplates,
  resolveResponseText,
  STANDARD_RESPONSE_TEMPLATES,
} from "../../frontend/src/lib/response-templates";

describe("command text", () => {
  it("splits the command from its input, including @botname", () => {
    expect(parseCommandText("/imagine a red fox")).toEqual({ cmd: "imagine", input: "a red fox" });
    expect(parseCommandText("/Imagine@my_bot  a fox\nat night")).toEqual({ cmd: "imagine", input: "a fox\nat night" });
    expect(parseCommandText("/help")).toEqual({ cmd: "help", input: "" });
    expect(parseCommandText("hello there")).toEqual({ cmd: null, input: "hello there" });
  });

  it("fills {input} in image prompts and treats other text as a style prefix", () => {
    expect(imagePrompt({ instruction: "A logo of {input}, flat" }, "a cat")).toBe("A logo of a cat, flat");
    expect(imagePrompt({ instruction: "Watercolor" }, "a cat")).toBe("Watercolor a cat");
    expect(imagePrompt({ instruction: "" }, "a cat")).toBe("a cat");
    expect(imagePrompt({ instruction: "" }, "x".repeat(3000)).length).toBe(2000);
  });

  it("describes the task and usage per command kind", () => {
    expect(commandTask({ command: "solve", description: "Solve", instruction: "Show steps" })).toContain("Show steps");
    expect(usageText({ command: "imagine", kind: "image" })).toContain("<what to draw>");
    expect(usageText({ command: "describe", kind: "describe" })).toContain("Send a photo");
    expect(usageText({ command: "search", kind: "search" })).toContain("<what to search on the web>");
  });
});

describe("command schema", () => {
  const ok = { command: "imagine", description: "Draw", kind: "image" as const, instruction: "" };

  it("accepts valid commands and normalises case", () => {
    expect(agentCommandSchema.parse({ ...ok, command: "Imagine" }).command).toBe("imagine");
    expect(agentCommandSchema.parse({ command: "search", description: "Search web", kind: "search", instruction: "" }).kind).toBe("search");
  });

  it("rejects reserved, malformed and duplicate names", () => {
    expect(agentCommandSchema.safeParse({ ...ok, command: "start" }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ ...ok, command: "9lives" }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ ...ok, command: "has space" }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ ...ok, description: "" }).success).toBe(false);
    expect(agentCommandsSchema.safeParse([ok, ok]).success).toBe(false);
    expect(agentCommandsSchema.safeParse(Array.from({ length: 16 }, (_, i) => ({ ...ok, command: `c${i}` }))).success).toBe(false);
  });
});

describe("agent templates", () => {
  const bySlug = new Map(MODEL_CATALOG.map((m) => [m.slug, m]));

  it("have unique ids and valid commands", () => {
    expect(new Set(AGENT_TEMPLATES.map((t) => t.id)).size).toBe(AGENT_TEMPLATES.length);
    for (const t of AGENT_TEMPLATES) expect(agentCommandsSchema.safeParse(t.commands ?? []).success).toBe(true);
  });

  it("only reference catalog models of the right kind", () => {
    for (const t of AGENT_TEMPLATES) {
      if (t.modelSlug) expect(executionMode(bySlug.get(t.modelSlug)!)).toBe("chat");
      if (t.imageModelSlug) expect(executionMode(bySlug.get(t.imageModelSlug)!)).toBe("image");
      // Image commands are useless without an image model.
      if (t.commands?.some((c) => c.kind === "image")) expect(Boolean(t.imageModelSlug)).toBe(true);
    }
  });

  it("are suggested from the catalog for image and vision models", () => {
    expect(templateForModel("flux-1-schnell")?.id).toBe("image-studio");
    expect(templateForModel("paligemma")?.id).toBe("photo-describer");
  });

  it("imports commands from a JSON file and ignores invalid ones", () => {
    const good = parseAgentImport(JSON.stringify({ name: "A", commands: [{ command: "/ask", description: "Ask", kind: "chat" }] }));
    expect(good.ok && good.value.commands?.[0]?.command).toBe("ask");
    const bad = parseAgentImport(JSON.stringify({ name: "A", commands: [{ command: "start", description: "x", kind: "chat" }] }));
    expect(bad.ok && bad.value.commands === undefined).toBe(true);
  });

  it("provides unique, production-ready system prompt templates for Playground and Telegram AI agents", () => {
    expect(PLAYGROUND_PROMPT_TEMPLATES.length >= 10).toBe(true);
    expect(TELEGRAM_AGENT_PROMPT_TEMPLATES.length >= 10).toBe(true);
    expect(getPromptTemplates("playground")).toEqual(PLAYGROUND_PROMPT_TEMPLATES);
    expect(getPromptTemplates("telegram")).toEqual(TELEGRAM_AGENT_PROMPT_TEMPLATES);

    const all = [...PLAYGROUND_PROMPT_TEMPLATES, ...TELEGRAM_AGENT_PROMPT_TEMPLATES];
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(t.name.trim().length > 0).toBe(true);
      expect(t.prompt.trim().length >= 120).toBe(true);
      expect(t.prompt.length <= 8000).toBe(true);
      expect(t.tags.length > 0).toBe(true);
    }
  });

  it("provides unique, schema-valid knowledge source templates prioritized by category", () => {
    expect(KNOWLEDGE_SOURCE_TEMPLATES.length >= 10).toBe(true);
    expect(new Set(KNOWLEDGE_SOURCE_TEMPLATES.map((t) => t.id)).size).toBe(KNOWLEDGE_SOURCE_TEMPLATES.length);

    for (const t of KNOWLEDGE_SOURCE_TEMPLATES) {
      expect(t.name.trim().length > 0).toBe(true);
      expect(t.category.trim().length > 0).toBe(true);
      expect(t.tagline.trim().length > 0).toBe(true);
      expect(t.tags.length > 0).toBe(true);
      expect(t.content.trim().length >= 200).toBe(true);
      expect(knowledgeInput.safeParse({ title: t.title, content: t.content }).success).toBe(true);
    }

    const supportQuick = getQuickKnowledgeTemplates("Customer Support", 4);
    expect(supportQuick.length).toBe(4);
    expect(supportQuick[0]?.category).toBe("Customer Support");
    expect(new Set(supportQuick.map((t) => t.id)).size).toBe(4);

    const eduQuick = getQuickKnowledgeTemplates("Education", 4);
    expect(eduQuick.length).toBe(4);
    expect(eduQuick[0]?.category).toBe("Education");
  });

  it("provides unique, Telegram-safe automatic response templates for Standard Bots and AI Agents", () => {
    expect(STANDARD_RESPONSE_TEMPLATES.length >= 10).toBe(true);
    expect(AI_AGENT_RESPONSE_TEMPLATES.length >= 10).toBe(true);
    expect(getResponseTemplates("standard")).toEqual(STANDARD_RESPONSE_TEMPLATES);
    expect(getResponseTemplates("ai-agent")).toEqual(AI_AGENT_RESPONSE_TEMPLATES);

    const all = [...STANDARD_RESPONSE_TEMPLATES, ...AI_AGENT_RESPONSE_TEMPLATES];
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(t.name.trim().length > 0).toBe(true);
      expect(t.category.trim().length > 0).toBe(true);
      expect(t.tagline.trim().length > 0).toBe(true);
      expect(t.tags.length > 0).toBe(true);
      expect(t.welcomeMessage.trim().length >= 30).toBe(true);
      expect(t.welcomeMessage.length <= 1000).toBe(true);
      expect(t.fallbackMessage.trim().length >= 30).toBe(true);
      expect(t.fallbackMessage.length <= 1000).toBe(true);
      // Plain text Telegram messages should not ship raw Markdown bold syntax.
      expect(t.welcomeMessage.includes("**")).toBe(false);
      expect(t.fallbackMessage.includes("**")).toBe(false);
    }

    const first = STANDARD_RESPONSE_TEMPLATES[0]!;
    const resolvedWelcome = resolveResponseText(first.welcomeMessage, "ISH-BOT");
    expect(resolvedWelcome.includes("ISH-BOT")).toBe(true);
    expect(resolvedWelcome.includes("{{BotName}}")).toBe(false);
    expect(resolveResponseText(first.welcomeMessage, "")).toBe(first.welcomeMessage);

    expect(getResponseTemplateMatch(first, resolvedWelcome, first.fallbackMessage, "ISH-BOT")).toBe("both");
    expect(getResponseTemplateMatch(first, resolvedWelcome, "Custom fallback", "ISH-BOT")).toBe("welcome");
    expect(getResponseTemplateMatch(first, "Custom welcome", first.fallbackMessage, "ISH-BOT")).toBe("fallback");
    expect(getResponseTemplateMatch(first, "Custom welcome", "Custom fallback", "ISH-BOT")).toBe(null);

    const ecomQuick = getQuickResponseTemplates("standard", "E-commerce", 4);
    expect(ecomQuick.length).toBe(4);
    expect(ecomQuick[0]?.category).toBe("E-Commerce");

    const aiSupportQuick = getQuickResponseTemplates("ai-agent", "Customer Support", 4);
    expect(aiSupportQuick.length).toBe(4);
    expect(aiSupportQuick[0]?.category).toBe("Customer Support");
  });
});
