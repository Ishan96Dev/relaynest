import { describe, it } from "node:test";
import { expect } from "./expect";
import {
  computePhaseBreakdown,
  describeStep,
  extractActorFromPayload,
  formatActorLabel,
  formatDuration,
  normalizeExecutionBounds,
  parseTriggerInfo,
  percentile,
} from "../src/lib/execution-format";
import {
  ExecutionTracer,
  reconstructLegacySteps,
  safeErrorMessage,
  sanitizeSummary,
} from "../src/lib/execution-tracer";

describe("execution formatting and bounds normalization", () => {
  it("parses command, AI chat, knowledge, and workflow triggers cleanly", () => {
    expect(parseTriggerInfo("command:/Imagine")).toEqual({ label: "/imagine", category: "command", command: "imagine" });
    expect(parseTriggerInfo("command:describe")).toEqual({ label: "/describe", category: "command", command: "describe" });
    expect(parseTriggerInfo("ai_message")).toEqual({ label: "AI Chat", category: "ai_chat" });
    expect(parseTriggerInfo("knowledge")).toEqual({ label: "Knowledge Base", category: "knowledge" });
    expect(parseTriggerInfo("telegram")).toEqual({ label: "Telegram Workflow", category: "workflow" });
  });

  it("repairs inverted legacy timestamps where started_at defaulted after finished_at", () => {
    const fixed = normalizeExecutionBounds(
      "2026-11-26T15:53:54.751Z",
      "2026-11-26T15:53:54.651Z",
      1224,
    );
    expect(fixed.startedAt).toBe("2026-11-26T15:53:53.427Z");
    expect(fixed.finishedAt).toBe("2026-11-26T15:53:54.651Z");
    expect(fixed.durationMs).toBe(1224);
  });

  it("preserves accurate recorded bounds and formats durations cleanly", () => {
    const ok = normalizeExecutionBounds(
      "2026-11-27T10:00:00.000Z",
      "2026-11-27T10:00:04.250Z",
      4250,
    );
    expect(ok.startedAt).toBe("2026-11-27T10:00:00.000Z");
    expect(ok.finishedAt).toBe("2026-11-27T10:00:04.250Z");
    expect(formatDuration(458)).toBe("458 ms");
    expect(formatDuration(17252)).toBe("17.25 s");
    expect(formatDuration(72500)).toBe("1m 12.5s");
    expect(percentile([100, 500, 1200, 3000, 17000], 0.95)).toBe(3000);
  });

  it("extracts Telegram actor identity safely from trigger_payload", () => {
    const actor = extractActorFromPayload({
      chatId: "1005449044",
      chatType: "private",
      updateId: 88,
      messageId: 12,
      from: { id: 1005449044, username: "ishan_dev", firstName: "Ishan" },
    });
    expect(actor.username).toBe("ishan_dev");
    expect(formatActorLabel(actor)).toBe("@ishan_dev");
    expect(formatActorLabel(extractActorFromPayload({ chatId: "999" }))).toBe("Chat 999");
  });
});

describe("ExecutionTracer", () => {
  it("records ordered step timelines and captures both successful outputs and redacted errors", async () => {
    let clock = 1_700_000_000_000;
    const tracer = new ExecutionTracer({ startedMs: clock, now: () => clock });

    tracer.record("intake", "telegram.received", {
      startedMs: clock,
      finishedMs: (clock += 20),
      inputSummary: { command: "/imagine", text: "/imagine neon city" },
    });

    const out = await tracer.trace(
      "ai_image",
      "ai.image_generate",
      { model: "black-forest-labs/flux.1-schnell", prompt: "neon city" },
      async () => {
        clock += 2100;
        return { modelUsed: "black-forest-labs/flux.1-schnell", bytes: 98_304 };
      },
      (res) => ({ modelUsed: res.modelUsed, bytes: res.bytes }),
    );
    expect(out.bytes).toBe(98_304);

    let threw = false;
    try {
      await tracer.trace(
        "send_photo",
        "telegram.send_photo",
        { chatId: "42" },
        async () => {
          clock += 150;
          throw Object.assign(new Error("Failed with 123456789:AAFakeSecretTokenValue123456789012345 and Bearer sk-secret"), { code: "SEND_FAILED" });
        },
      );
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(tracer.list.length).toBe(3);
    expect(tracer.list.map((s) => s.stepOrder)).toEqual([1, 2, 3]);
    expect(tracer.list[1]?.durationMs).toBe(2100);
    expect(tracer.list[2]?.status).toBe("failed");
    expect(tracer.list[2]?.errorCode).toBe("SEND_FAILED");
    expect(tracer.list[2]?.errorMessageSafe).toContain("[redacted-token]");
    expect(tracer.list[2]?.errorMessageSafe).toContain("Bearer [redacted]");
    expect(tracer.list[2]?.errorMessageSafe).not.toContain("AAFakeSecretTokenValue");

    const rows = tracer.toDbRows("ws-1", "exec-1");
    expect(rows.length).toBe(3);
    expect(rows[0]?.step_order).toBe(1);
    expect(rows[1]?.duration_ms).toBe(2100);
  });

  it("clamps oversized summary strings and redacts secrets", () => {
    const clean = sanitizeSummary({ text: "a".repeat(2000), skip: undefined });
    expect(String(clean?.text).length).toBe(1500);
    expect("skip" in (clean ?? {})).toBe(false);
    expect(safeErrorMessage(new Error("Bearer topsecret123"))).toBe("Bearer [redacted]");
  });
});

describe("reconstructLegacySteps and phase breakdown", () => {
  it("reconstructs a complete chronological /describe journey from correlated vision telemetry", () => {
    const steps = reconstructLegacySteps({
      executionId: "exec-describe-1",
      triggerType: "command:/describe",
      status: "succeeded",
      startedAt: "2026-11-25T16:55:04.376Z",
      finishedAt: "2026-11-25T16:55:03.650Z",
      durationMs: 17252,
      errorCode: null,
      errorMessage: null,
      botName: "ISH-BOT",
      botUsername: "IshannnnnnnnnnnBot",
      agentModelName: "Nemotron 3.5 Lightning 30B",
      agentImageModelName: "FLUX.1 Schnell",
      aiCalls: [
        {
          id: 14,
          source: "nvidia",
          modelSlug: "nemotron-3-5-super-vl-120b-a12b",
          apiModelId: "nvidia/nemotron-3.5-super-vl-120b-a12b",
          kind: "vision",
          origin: "agent",
          promptTokens: 1387,
          completionTokens: 459,
          totalTokens: 1846,
          costUsd: 0,
          latencyMs: 15797,
          providerRequestId: null,
          createdAt: "2026-11-25T16:55:04.148Z",
        },
      ],
    });

    expect(steps.map((s) => s.nodeType)).toEqual([
      "telegram.received",
      "telegram.download_file",
      "ai.vision",
      "telegram.send_message",
    ]);
    expect(steps.every((s) => s.inferred === true)).toBe(true);
    expect(steps[2]?.outputSummary?.totalTokens).toBe(1846);
    expect(steps[2]?.title).toBe("AI Vision Model Invoked");

    // Chronological order must hold across all reconstructed stages.
    for (let i = 1; i < steps.length; i++) {
      expect(Date.parse(steps[i]!.startedAt!) >= Date.parse(steps[i - 1]!.startedAt!)).toBe(true);
    }

    const breakdown = computePhaseBreakdown(steps, 17252);
    expect(breakdown.length > 0).toBe(true);
    expect(breakdown[0]?.phase).toBe("model");
    expect(describeStep("telegram.send_photo", "p", null, { mimeType: "image/jpeg", bytes: 120_000 }).phase).toBe("delivery");
  });
});
