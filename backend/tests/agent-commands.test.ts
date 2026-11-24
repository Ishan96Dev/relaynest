import { describe, it } from "node:test";
import { expect } from "./expect";
import { commandTask, imagePrompt, parseCommandText, usageText } from "../src/server/ai/commands";
import { agentCommandSchema, agentCommandsSchema } from "../src/lib/validation/schemas";
import { MODEL_CATALOG, executionMode } from "../src/server/ai/model-catalog";
import { AGENT_TEMPLATES, parseAgentImport, templateForModel } from "../../frontend/src/lib/agent-templates";

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
  });
});

describe("command schema", () => {
  const ok = { command: "imagine", description: "Draw", kind: "image" as const, instruction: "" };

  it("accepts valid commands and normalises case", () => {
    expect(agentCommandSchema.parse({ ...ok, command: "Imagine" }).command).toBe("imagine");
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
});
