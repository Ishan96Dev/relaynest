import type { AgentTools } from "@backend/server/ai/agent";
import { agentCommandsSchema, type AgentCommand } from "@backend/lib/validation/schemas";

/** Fields a template or an imported file can fill in the AI agent wizard. */
export interface AgentPreset {
  name: string;
  description: string;
  category: string;
  language: string;
  instructions: string;
  welcomeMessage: string;
  fallbackMessage: string;
  temperature: number;
  maxTokens: number;
  memoryTurns: number;
  tools?: Partial<AgentTools>;
  username?: string;
  /** Catalog model that suits this agent. Applied only when the workspace can use it. */
  modelSlug?: string;
  /** Image model for image commands (catalog slug). */
  imageModelSlug?: string;
  /** Slash commands for the Telegram menu. */
  commands?: AgentCommand[];
}

export interface AgentTemplate extends AgentPreset {
  id: string;
  tagline: string;
  /** Catalog models this template showcases, so the model catalog can suggest it. */
  matchesModels?: string[];
}

const cmd = (command: string, description: string, kind: AgentCommand["kind"], instruction = ""): AgentCommand => ({ command, description, kind, instruction });

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "support-agent", name: "Support Assistant", tagline: "Answers customer questions from your policies.", category: "Customer Support", language: "English",
    description: "A friendly assistant that answers customer questions about orders, shipping and returns.",
    instructions: "You are a customer support assistant. Answer politely and briefly using the reference material first. If you cannot help, ask the person to contact support. Never invent policies, prices or order details.",
    welcomeMessage: "Hi! I'm here to help with orders, shipping and returns. What can I do for you?",
    fallbackMessage: "Sorry, I can't answer that right now. Please contact our support team.",
    temperature: 0.3, maxTokens: 1024, memoryTurns: 10,
    modelSlug: "nemotron-3-5-lightning-30b-a3b", matchesModels: ["nemotron-3-5-lightning-30b-a3b"],
    commands: [
      cmd("contact", "How to reach a human", "chat", "Explain politely how the person can reach a human support agent, using the contact details in the reference material."),
      cmd("order", "Help with an order question", "chat", "Help with the order question. Ask for the order number if needed and never invent order details."),
    ],
  },
  {
    id: "faq-agent", name: "FAQ Assistant", tagline: "Replies only from the FAQs you add.", category: "FAQ Assistant", language: "English",
    description: "Answers frequently asked questions using only the knowledge you provide.",
    instructions: "Answer frequently asked questions using only the reference material. If the answer is not there, say you do not know and suggest where to look.",
    welcomeMessage: "Hello! Ask me anything from our FAQ.",
    fallbackMessage: "I don't have an answer for that yet. Please try rephrasing your question.",
    temperature: 0.2, maxTokens: 2048, memoryTurns: 5,
    modelSlug: "nemotron-3-nano-omni-30b-a3b-reasoning", matchesModels: ["nemotron-3-nano-omni-30b-a3b-reasoning", "nemotron-3-embed-1b"],
    commands: [cmd("faq", "Ask a question from the FAQ", "chat", "Answer the question using only the reference material.")],
  },
  {
    id: "community-agent", name: "Community Manager", tagline: "Welcomes members and keeps chats friendly.", category: "Community Manager", language: "English",
    description: "Welcomes new members, answers community questions and keeps the conversation friendly.",
    instructions: "Welcome new members, answer questions about the community and keep a friendly, neutral tone. Politely decline off-topic or abusive requests.",
    welcomeMessage: "Welcome to the community! Ask me about the rules, events or how to get started.",
    fallbackMessage: "I'm not sure about that. A moderator will follow up soon.",
    temperature: 0.6, maxTokens: 1024, memoryTurns: 10,
    modelSlug: "nemotron-3-5-lightning-30b-a3b",
    commands: [
      cmd("rules", "Show the community rules", "chat", "List the community rules from the reference material. If none are provided, say the admins have not added rules yet."),
      cmd("summarize", "Summarize the text you send", "chat", "Summarize the text in 3 to 5 short bullet points."),
    ],
  },
  {
    id: "sales-agent", name: "Sales Assistant", tagline: "Qualifies leads and recommends products.", category: "Sales Assistant", language: "English",
    description: "Helps visitors pick the right product and collects contact details for follow-up.",
    instructions: "Help visitors find the right product. Ask short questions about their needs, recommend options from the reference material and offer to collect an email for a follow-up. Do not promise discounts that are not in the reference material.",
    welcomeMessage: "Hi! Tell me what you're looking for and I'll suggest the best option.",
    fallbackMessage: "I'll pass your question to our sales team. Could you share your email?",
    temperature: 0.5, maxTokens: 1024, memoryTurns: 10,
  },
  {
    id: "study-agent", name: "Study Helper", tagline: "Explains topics and quizzes learners.", category: "Education", language: "English",
    description: "Explains topics step by step and quizzes learners to check understanding.",
    instructions: "Explain concepts in simple steps with short examples. After an explanation, offer a quick question to check understanding. Encourage the learner and correct mistakes kindly.",
    welcomeMessage: "Hi! What would you like to learn today?",
    fallbackMessage: "I couldn't answer that. Try asking in a different way.",
    temperature: 0.6, maxTokens: 2048, memoryTurns: 20,
  },
  {
    id: "productivity-agent", name: "Daily Planner", tagline: "Plans tasks and summarises your day.", category: "Productivity", language: "English",
    description: "Helps plan tasks, prioritise the day and summarise to-do lists.",
    instructions: "Help the user plan their day. Turn messy lists into short prioritised tasks, suggest realistic time blocks and keep replies concise.",
    welcomeMessage: "Hi! Send me your to-do list and I'll turn it into a plan.",
    fallbackMessage: "Sorry, I couldn't plan that. Please try again.",
    temperature: 0.5, maxTokens: 1024, memoryTurns: 10,
  },
  {
    id: "image-studio", name: "Image Studio", tagline: "Draws pictures on command with FLUX.1 Schnell.", category: "Entertainment", language: "English",
    description: "Creates images from your text. Send /imagine followed by what you want to see.",
    instructions: "You are a friendly creative assistant. Help people write better image descriptions. When someone asks for a picture, tell them to use /imagine followed by a description, and suggest subject, style, lighting and mood. Keep answers short.",
    welcomeMessage: "Hi! I draw pictures. Try: /imagine a red fox in a snowy forest, watercolor style",
    fallbackMessage: "Sorry, I couldn't make that picture. Please try a different description.",
    temperature: 0.7, maxTokens: 1024, memoryTurns: 6,
    modelSlug: "nemotron-3-5-lightning-30b-a3b", imageModelSlug: "flux-1-schnell", matchesModels: ["flux-1-schnell", "cosmos3-nano"],
    commands: [
      cmd("imagine", "Generate an image from a description", "image"),
      cmd("logo", "Design a simple logo", "image", "A clean, minimalist vector logo of {input}, flat design, centered, white background"),
      cmd("poster", "Create a poster-style image", "image", "A bold, eye-catching poster illustration of {input}, dramatic lighting, high detail"),
    ],
  },
  {
    id: "photo-describer", name: "Photo Describer", tagline: "Analyzes photos, charts and text with Nemotron 3.5 Super VL.", category: "Productivity", language: "English",
    description: "Send a photo with the caption /describe to get detailed visual analysis, OCR and chart reading.",
    instructions: "You help people understand pictures, screenshots, documents and charts. When someone has not sent a photo, explain that they should send a photo with the caption /describe. Keep answers clear and accurate.",
    welcomeMessage: "Hi! Send me a photo with the caption /describe and I will analyze it in detail. Use /text to extract text from a photo.",
    fallbackMessage: "Sorry, I couldn't look at that photo. Please try again in a moment.",
    temperature: 0.3, maxTokens: 1024, memoryTurns: 4,
    modelSlug: "nemotron-3-5-super-vl-120b-a12b", matchesModels: ["paligemma", "nemotron-3-5-super-vl-120b-a12b", "nemotron-3-5-bolt-e4b"],
    commands: [
      cmd("describe", "Describe and analyze a photo you send", "describe", "Describe and analyze this image in detail, including any visible text, numbers, labels or charts."),
      cmd("text", "Read the text in a photo", "describe", "Extract and transcribe all visible text and numbers in this image accurately."),
    ],
  },
  {
    id: "problem-solver", name: "Problem Solver", tagline: "Thinks step by step with a reasoning model.", category: "Education", language: "English",
    description: "Works through maths, logic and planning problems step by step, then gives a clear answer.",
    instructions: "Solve problems carefully. Show the key steps briefly, then state the final answer on its own line. If the question is ambiguous, ask one clarifying question first.",
    welcomeMessage: "Hi! Send me a problem and use /solve for a step-by-step answer.",
    fallbackMessage: "Sorry, that took too long to work out. Please try a simpler version.",
    temperature: 0.6, maxTokens: 4096, memoryTurns: 6,
    modelSlug: "nemotron-3-nano-omni-30b-a3b-reasoning", matchesModels: ["kimi-k3-1-pro", "glm-5-3-flash", "minimax-m3-1-flash", "muse-glimmer-30b"],
    commands: [
      cmd("solve", "Solve a problem step by step", "chat", "Solve the problem step by step and give the final answer on its own line."),
      cmd("explain", "Explain a topic simply", "chat", "Explain the topic simply, as if to a curious beginner, with one example."),
    ],
  },
  {
    id: "coding-helper", name: "Coding Helper", tagline: "Explains, reviews and writes code.", category: "Productivity", language: "English",
    description: "Helps with programming questions: explains code, reviews snippets and suggests fixes.",
    instructions: "You are a senior software engineer. Give correct, concise answers. Put code in plain text with indentation (no Markdown tables). Mention edge cases and say when you are unsure.",
    welcomeMessage: "Hi! Paste some code or ask a programming question.",
    fallbackMessage: "Sorry, I couldn't answer that right now. Please try again.",
    temperature: 0.3, maxTokens: 4096, memoryTurns: 10,
    modelSlug: "mistral-large-4-1t-a52b", matchesModels: ["mistral-large-4-1t-a52b"],
    commands: [
      cmd("code", "Write code for a task", "chat", "Write the requested code. Keep it short and add a one-line note on how to run it."),
      cmd("review", "Review the code you send", "chat", "Review the code. List bugs first, then improvements, most important first."),
      cmd("explain", "Explain the code you send", "chat", "Explain what the code does, step by step, in plain language."),
    ],
  },
  {
    id: "translator", name: "Translator", tagline: "Translates and fixes text.", category: "Productivity", language: "English",
    description: "Translates text between languages and fixes grammar while keeping the meaning.",
    instructions: "You translate faithfully and naturally. If the person names a target language, use it; otherwise translate to English. Reply with the translation only, then optionally one short note.",
    welcomeMessage: "Hi! Use /translate followed by your text. Add a language, for example: /translate to French: Good morning",
    fallbackMessage: "Sorry, I couldn't translate that right now.",
    temperature: 0.2, maxTokens: 1024, memoryTurns: 2,
    modelSlug: "nemotron-3-5-lightning-30b-a3b", matchesModels: [],
    commands: [
      cmd("translate", "Translate text", "chat", "Translate the text. Use the language the person names, or English if none is named."),
      cmd("fix", "Fix grammar and spelling", "chat", "Correct the grammar and spelling without changing the meaning. Reply with the corrected text only."),
    ],
  },
  {
    id: "writing-assistant", name: "Writing Assistant", tagline: "Drafts posts and emails, and draws covers.", category: "Productivity", language: "English",
    description: "Writes short posts, emails and captions, and can draw a matching picture.",
    instructions: "You are a helpful writing assistant. Match the tone the person asks for. Keep drafts short and ready to send.",
    welcomeMessage: "Hi! Try /post, /email or /cover for a matching picture.",
    fallbackMessage: "Sorry, I couldn't write that right now.",
    temperature: 0.8, maxTokens: 1024, memoryTurns: 6,
    modelSlug: "nemotron-3-5-lightning-30b-a3b", imageModelSlug: "flux-1-schnell", matchesModels: [],
    commands: [
      cmd("post", "Write a short social media post", "chat", "Write a short, engaging social media post about the topic. Include 2 relevant hashtags."),
      cmd("email", "Draft a short email", "chat", "Draft a short, polite email about the topic with a subject line."),
      cmd("cover", "Draw a cover image", "image", "A clean, modern illustration for a social media post about {input}"),
    ],
  },
];

/** The template that best fits a catalog model, if any. */
export const templateForModel = (slug: string) => AGENT_TEMPLATES.find((t) => t.matchesModels?.includes(slug) || t.imageModelSlug === slug);

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

export type ImportResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Reads a JSON export or hand-written file into agent settings. Unknown fields are ignored. */
export function parseAgentImport(text: string): ImportResult<Partial<AgentPreset>> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, message: "That is not valid JSON. Check for missing quotes or commas." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "Expected a JSON object with the agent's settings." };
  const o = raw as Record<string, unknown>;
  const out: Partial<AgentPreset> = {};
  const name = str(o.name, 50); if (name) out.name = name;
  const username = str(o.username, 32); if (username) out.username = username.replace(/^@/, "");
  const description = str(o.description, 300); if (description) out.description = description;
  const category = str(o.category, 60); if (category) out.category = category;
  const language = str(o.language, 40); if (language) out.language = language;
  const instructions = str(o.instructions, 8000); if (instructions) out.instructions = instructions;
  const welcome = str(o.welcomeMessage, 1000); if (welcome) out.welcomeMessage = welcome;
  const fallback = str(o.fallbackMessage, 1000); if (fallback) out.fallbackMessage = fallback;
  if (typeof o.temperature === "number") out.temperature = num(o.temperature, 0, 1, 0.5);
  if (typeof o.maxTokens === "number") out.maxTokens = Math.round(num(o.maxTokens, 64, 4096, 1024));
  if (typeof o.memoryTurns === "number") out.memoryTurns = Math.round(num(o.memoryTurns, 0, 30, 10));
  const modelSlug = str(o.modelSlug, 90); if (modelSlug) out.modelSlug = modelSlug;
  const imageModelSlug = str(o.imageModelSlug, 90); if (imageModelSlug) out.imageModelSlug = imageModelSlug;
  if (Array.isArray(o.commands)) {
    const parsed = agentCommandsSchema.safeParse(o.commands.map((c) => (c && typeof c === "object" ? { instruction: "", ...(c as object), command: String((c as { command?: unknown }).command ?? "").replace(/^\//, "") } : c)));
    if (parsed.success) out.commands = parsed.data;
  }
  if (o.tools && typeof o.tools === "object") {
    const t = o.tools as Record<string, unknown>;
    const tools: Partial<AgentTools> = {};
    for (const k of ["datetime", "matchLanguage", "mentionOnly", "typing"] as const) if (typeof t[k] === "boolean") tools[k] = t[k];
    out.tools = tools;
  }
  if (!Object.keys(out).length) return { ok: false, message: "No known fields found. Use keys such as name, description, instructions and welcomeMessage." };
  return { ok: true, value: out };
}

export interface BotImport {
  name?: string;
  description?: string;
  welcomeMessage?: string;
  defaultResponse?: string;
  commands: { command: string; description: string }[];
}

/** Reads a JSON file into standard-bot settings (name, messages and commands). */
export function parseBotImport(text: string): ImportResult<BotImport> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, message: "That is not valid JSON. Check for missing quotes or commas." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "Expected a JSON object with the bot's settings." };
  const o = raw as Record<string, unknown>;
  const cmds = Array.isArray(o.commands) ? o.commands : [];
  const commands = cmds.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const r = c as Record<string, unknown>;
    const command = str(r.command, 33)?.trim();
    return command && /^\/?[a-z0-9_]{1,32}$/i.test(command) ? [{ command: command.startsWith("/") ? command : `/${command}`, description: str(r.description, 256) ?? "" }] : [];
  });
  const out: BotImport = { name: str(o.name, 50), description: str(o.description, 200), welcomeMessage: str(o.welcomeMessage, 4096), defaultResponse: str(o.defaultResponse, 4096), commands };
  if (!out.name && !out.description && !out.welcomeMessage && !out.defaultResponse && !commands.length) return { ok: false, message: "No known fields found. Use keys such as name, description, welcomeMessage and commands." };
  return { ok: true, value: out };
}
