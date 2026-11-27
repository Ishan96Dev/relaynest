import type { NodeType } from "@backend/server/workflow-engine/schema";

export interface FieldSpec { key: string; label: string; kind: "text" | "textarea" | "select" | "number" | "boolean" | "bot"; options?: string[]; hint?: string }
export interface NodeSpec { type: NodeType; label: string; description: string; group: "Triggers" | "Conditions" | "Actions" | "AI"; fields: FieldSpec[]; defaults: Record<string, unknown> }

export const NODE_SPECS: NodeSpec[] = [
  { type: "trigger.telegram.message", label: "Telegram Message Received", description: "Runs when a user messages your bot.", group: "Triggers", fields: [{ key: "botId", label: "Bot", kind: "bot" }, { key: "commandFilter", label: "Command filter (optional)", kind: "text" }], defaults: { botId: "" } },
  { type: "trigger.webhook", label: "Incoming Webhook", description: "Runs when an HTTP request hits your webhook URL.", group: "Triggers", fields: [], defaults: {} },
  { type: "trigger.schedule", label: "Schedule", description: "Runs on a cron schedule.", group: "Triggers", fields: [{ key: "cron", label: "Cron expression", kind: "text", hint: "minute hour day month weekday, e.g. 0 9 * * 1-5 runs weekdays at 9:00" }, { key: "timezone", label: "Time zone", kind: "text", hint: "IANA name, e.g. Asia/Kolkata. Empty means UTC." }], defaults: { cron: "0 9 * * 1-5", timezone: "Asia/Kolkata" } },
  {
    type: "action.ai.research",
    label: "AI Agent Research",
    description: "Fetches live NSE/BSE/MSE quotes & web search and synthesizes {{ai.text}}.",
    group: "AI",
    fields: [
      { key: "prompt", label: "Research / Briefing prompt", kind: "textarea", hint: "Use {{event.text}} or write a daily watchlist prompt. Connect to Send Telegram Message with {{ai.text}}." },
      { key: "category", label: "Domain focus", kind: "select", options: ["Finance & Markets", "Real Estate & Land", "Education", "Sports", "Gaming", "Business & Ops", "Legal & Tax", "Productivity"] },
      { key: "includeMarketData", label: "Include Live NSE/BSE/MSE Market Feed", kind: "boolean" },
      { key: "includeWebSearch", label: "Include Live Open Web Search", kind: "boolean" },
      { key: "systemPrompt", label: "Custom system instructions (optional)", kind: "textarea" },
    ],
    defaults: {
      prompt: "Daily Indian Stock Market Broker Briefing: Live NSE/BSE prices for NIFTY 50, SENSEX, RELIANCE, TCS, HDFCBANK and top news today.",
      category: "Finance & Markets",
      includeMarketData: true,
      includeWebSearch: true,
      systemPrompt: "",
    },
  },
  { type: "condition.equals", label: "Equals", description: "True when a field equals a value.", group: "Conditions", fields: [{ key: "field", label: "Field path", kind: "text", hint: "e.g. event.status" }, { key: "value", label: "Value", kind: "text" }], defaults: { field: "event.", value: "" } },
  { type: "condition.notEquals", label: "Not Equals", description: "True when a field differs from a value.", group: "Conditions", fields: [{ key: "field", label: "Field path", kind: "text", hint: "e.g. event.status" }, { key: "value", label: "Value", kind: "text" }], defaults: { field: "event.", value: "" } },
  { type: "condition.contains", label: "Text Contains", description: "True when text contains a value.", group: "Conditions", fields: [{ key: "field", label: "Field path", kind: "text", hint: "e.g. event.text" }, { key: "value", label: "Contains", kind: "text" }, { key: "caseSensitive", label: "Case sensitive", kind: "boolean" }], defaults: { field: "event.text", value: "", caseSensitive: false } },
  { type: "condition.isEmpty", label: "Is Empty", description: "True when a field is empty.", group: "Conditions", fields: [{ key: "field", label: "Field path", kind: "text" }], defaults: { field: "event." } },
  { type: "condition.httpStatus", label: "HTTP Status", description: "True when the last HTTP status is in range.", group: "Conditions", fields: [{ key: "min", label: "Min status", kind: "number" }, { key: "max", label: "Max status", kind: "number" }], defaults: { min: 200, max: 299 } },
  { type: "action.telegram.sendMessage", label: "Send Telegram Message", description: "Sends a formatted message via a bot.", group: "Actions", fields: [{ key: "botId", label: "Bot", kind: "bot" }, { key: "chatIdSource", label: "Chat ID source", kind: "select", options: ["configured", "trigger"] }, { key: "chatId", label: "Chat ID", kind: "text" }, { key: "text", label: "Message", kind: "textarea", hint: "Use {{ai.text}} after an AI Agent Research node, or {{event.field}}." }], defaults: { botId: "", chatIdSource: "configured", chatId: "", text: "{{ai.text}}" } },
  { type: "action.http.request", label: "HTTP Request", description: "Calls an external HTTPS endpoint.", group: "Actions", fields: [{ key: "method", label: "Method", kind: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, { key: "url", label: "URL (HTTPS only)", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }], defaults: { method: "GET", url: "https://" } },
];

export const specFor = (t: string) => NODE_SPECS.find((s) => s.type === t)!;
