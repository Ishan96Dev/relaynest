import { describe, it } from "node:test";
import { expect } from "./expect";
import { executeWorkflow, validateWorkflow, type ActionAdapters, type TriggerEvent, type WorkflowDefinition } from "../src/server/workflow-engine";

const def = (): WorkflowDefinition => ({
  version: 1,
  nodes: [
    { id: "t", type: "trigger.webhook", position: { x: 0, y: 0 }, config: {} },
    { id: "c", type: "condition.equals", position: { x: 0, y: 0 }, config: { field: "event.status", value: "success" } },
    { id: "a", type: "action.telegram.sendMessage", position: { x: 0, y: 0 }, config: { botId: "b1", chatIdSource: "configured", chatId: "42", text: "Deploy {{event.status}} for {{event.repo}}" } },
    { id: "b", type: "action.telegram.sendMessage", position: { x: 0, y: 0 }, config: { botId: "b1", chatIdSource: "configured", chatId: "42", text: "failed" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "c" },
    { id: "e2", source: "c", target: "a", sourceHandle: "true" },
    { id: "e3", source: "c", target: "b", sourceHandle: "false" },
  ],
});

const event = (payload: Record<string, unknown>): TriggerEvent => ({ type: "webhook", workspaceId: "w", source: "t", occurredAt: "", payload });

function adapters() {
  const sent: string[] = [];
  const a: ActionAdapters = {
    sendTelegramMessage: async (i) => { sent.push(i.text); return { externalMessageId: "1" }; },
    httpRequest: async () => ({ status: 200 }),
  };
  return { a, sent };
}

describe("validateWorkflow", () => {
  it("accepts a valid graph", () => expect(validateWorkflow(def())).toEqual({ valid: true, issues: [] }));
  it("rejects missing trigger, cycles, unknown nodes and bad config", () => {
    const d = def();
    d.nodes.shift();
    d.edges = d.edges.filter((e) => e.source !== "t");
    expect(validateWorkflow(d).issues.map((i) => i.code)).toContain("TRIGGER_COUNT");

    const cyc = def();
    cyc.edges.push({ id: "e9", source: "a", target: "c" });
    expect(validateWorkflow(cyc).issues.map((i) => i.code)).toContain("CYCLE");

    expect(validateWorkflow({ version: 1, nodes: [{ id: "x", type: "action.shell", config: {} }], edges: [] }).valid).toBe(false);

    const bad = def();
    bad.nodes[2]!.config = { botId: "b1", chatIdSource: "configured", text: "" };
    expect(validateWorkflow(bad).issues.some((i) => i.code === "NODE_CONFIG" && i.nodeId === "a")).toBe(true);
  });
  it("flags unreachable nodes", () => {
    const d = def();
    d.nodes.push({ id: "z", type: "action.http.request", position: { x: 0, y: 0 }, config: { method: "GET", url: "https://example.com" } });
    expect(validateWorkflow(d).issues.some((i) => i.code === "UNREACHABLE" && i.nodeId === "z")).toBe(true);
  });
});

describe("executeWorkflow", () => {
  it("follows the true branch and renders templates", async () => {
    const { a, sent } = adapters();
    const r = await executeWorkflow(def(), event({ status: "success", repo: "relaynest" }), a);
    expect(r.status).toBe("succeeded");
    expect(sent).toEqual(["Deploy success for relaynest"]);
    expect(r.steps.find((s) => s.nodeId === "b")?.status).toBe("skipped");
  });
  it("follows the false branch", async () => {
    const { a, sent } = adapters();
    await executeWorkflow(def(), event({ status: "error" }), a);
    expect(sent).toEqual(["failed"]);
  });
  it("fails safely on an action error without leaking details", async () => {
    const r = await executeWorkflow(def(), event({ status: "success" }), {
      sendTelegramMessage: async () => { throw new Error("boom"); },
      httpRequest: async () => ({ status: 200 }),
    });
    expect(r.status).toBe("failed");
    expect(r.steps.at(-1)?.errorCode).toBe("ACTION_FAILED");
  });
  it("blocks SSRF in HTTP action", async () => {
    const d: WorkflowDefinition = {
      version: 1,
      nodes: [
        { id: "t", type: "trigger.webhook", position: { x: 0, y: 0 }, config: {} },
        { id: "h", type: "action.http.request", position: { x: 0, y: 0 }, config: { method: "GET", url: "https://169.254.169.254/" } },
      ],
      edges: [{ id: "e", source: "t", target: "h" }],
    };
    const r = await executeWorkflow(d, event({}), adapters().a);
    expect(r.status).toBe("failed");
  });
});
