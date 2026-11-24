import { category, configSchemas, LIMITS, workflowDefinitionSchema, type WorkflowDefinition } from "./schema";

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Validates the graph before activation. Pure and deterministic. */
export function validateWorkflow(input: unknown): ValidationResult {
  const parsed = workflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((i) => ({ code: "SCHEMA", message: `${i.path.join(".") || "definition"}: ${i.message}` })),
    };
  }
  const def = parsed.data;
  const issues: ValidationIssue[] = [];
  const byId = new Map(def.nodes.map((n) => [n.id, n]));

  if (byId.size !== def.nodes.length) issues.push({ code: "DUPLICATE_NODE", message: "Node IDs must be unique." });
  if (def.nodes.length > LIMITS.maxNodes) issues.push({ code: "TOO_MANY_NODES", message: `At most ${LIMITS.maxNodes} nodes are allowed.` });

  const triggers = def.nodes.filter((n) => category(n.type) === "trigger");
  if (triggers.length !== 1) {
    issues.push({ code: "TRIGGER_COUNT", message: `Exactly one trigger is required (found ${triggers.length}).` });
  }

  for (const n of def.nodes) {
    const r = configSchemas[n.type].safeParse(n.config);
    if (!r.success) {
      for (const i of r.error.issues) {
        issues.push({ code: "NODE_CONFIG", nodeId: n.id, message: `${i.path.join(".") || "config"}: ${i.message}` });
      }
    }
  }

  const out = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const e of def.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      issues.push({ code: "EDGE_ENDPOINT", edgeId: e.id, message: "Edge references a missing node." });
      continue;
    }
    if (category(t.type) === "trigger") issues.push({ code: "EDGE_INTO_TRIGGER", edgeId: e.id, message: "Triggers cannot have incoming edges." });
    if (e.sourceHandle && category(s.type) !== "condition") {
      issues.push({ code: "EDGE_HANDLE", edgeId: e.id, message: "Only condition nodes have true/false outputs." });
    }
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  if (hasCycle(def, out)) issues.push({ code: "CYCLE", message: "Cycles are not supported." });

  const first = triggers[0];
  if (first) {
    const reachable = new Set<string>();
    const stack = [first.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      stack.push(...(out.get(id) ?? []));
    }
    for (const n of def.nodes) {
      if (!reachable.has(n.id)) {
        issues.push({ code: "UNREACHABLE", nodeId: n.id, message: "Node is not reachable from the trigger." });
      }
    }
    if (!def.nodes.some((n) => category(n.type) === "action" && reachable.has(n.id))) {
      issues.push({ code: "NO_ACTION", message: "Add at least one action reachable from the trigger." });
    }
  }

  return { valid: issues.length === 0, issues };
}

function hasCycle(def: WorkflowDefinition, out: Map<string, string[]>): boolean {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of out.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return def.nodes.some((n) => visit(n.id));
}
