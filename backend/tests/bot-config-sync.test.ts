import { describe, it } from "node:test";
import { expect } from "./expect";
import { botResponseRuleInput, botResponsesUpdateInput, commandInput } from "../src/lib/validation/schemas";

describe("bot command and response schemas", () => {
  it("accepts standard text commands with non-empty responseText", () => {
    const parsed = commandInput.parse({
      command: "/Pricing",
      description: "Show pricing plans",
      responseType: "text",
      responseText: "Pro starts at $19/mo.",
      enabled: true,
    });
    expect(parsed.command).toBe("/Pricing");
    expect(parsed.responseType).toBe("text");
    expect(parsed.responseText).toBe("Pro starts at $19/mo.");
  });

  it("rejects text commands with an empty responseText", () => {
    const res = commandInput.safeParse({
      command: "pricing",
      description: "Show pricing",
      responseType: "text",
      responseText: "   ",
      enabled: true,
    });
    expect(res.success).toBe(false);
  });

  it("allows AI and built-in commands with empty responseText/instruction", () => {
    for (const responseType of ["builtin", "chat", "search", "image", "describe"] as const) {
      const parsed = commandInput.parse({
        command: responseType === "builtin" ? "start" : responseType,
        description: "Menu item",
        responseType,
        responseText: "",
        enabled: true,
      });
      expect(parsed.responseType).toBe(responseType);
    }
  });

  it("validates bot response keyword rules and bulk update payload", () => {
    expect(
      botResponseRuleInput.safeParse({
        matchType: "keyword",
        matchValue: "",
        responseText: "Hi",
        priority: 10,
        enabled: true,
      }).success,
    ).toBe(false);

    const okPayload = botResponsesUpdateInput.parse({
      welcomeMessage: "Hello!",
      defaultResponse: "Sorry, try /help",
      rules: [
        { matchType: "keyword", matchValue: "pricing", responseText: "Plans start at $0.", priority: 10, enabled: true },
      ],
    });
    expect(okPayload.rules.length).toBe(1);
    expect(okPayload.rules[0]?.matchValue).toBe("pricing");
  });
});
