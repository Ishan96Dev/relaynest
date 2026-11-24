/**
 * Source of truth for the AI Model Catalog seed. `pnpm models:sql` renders this list into the
 * `ai_models` seed migration, and the catalog page falls back to it when Supabase is not configured.
 * Facts come from the public NVIDIA Build and Vercel AI Gateway model pages linked in `sourceUrl`.
 */
export type ModelType = "chat" | "multimodal" | "embedding" | "image_generation" | "evaluation";
export type ModelSource = "nvidia" | "vercel";

export interface CatalogModel {
  slug: string;
  name: string;
  providerKey: string;
  providerName: string;
  source: ModelSource;
  sourceUrl: string;
  /** Model ID used by the upstream API, shown in the quick-start example. */
  apiModelId: string;
  modelType: ModelType;
  badge: string | null;
  description: string;
  capabilities: string[];
  /** Display label such as "31B" or "2.8T (104B active)". */
  paramsLabel: string | null;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  inputModalities: string[];
  outputModalities: string[];
  isFree: boolean;
  isOpenSource: boolean;
  isFeatured: boolean;
  /** Reasoning model: it writes a long hidden "thinking" pass before the answer, so it needs more tokens and answers slower. */
  isThinking: boolean;
  /** Sampling temperature and reply length that suit this model; applied when the model is selected. */
  defaultTemperature: number;
  defaultMaxTokens: number;
  license: string | null;
  deployment: string[];
  releasedAt: string | null;
  sourceUpdatedAt: string | null;
  sortOrder: number;
}

/** Catalog model as served by the API: database id plus the signed-in user's favourite flag. */
export interface ModelDto extends CatalogModel {
  id: string;
  favorite: boolean;
}

/** How the Playground and the API run a model. */
export type ExecutionMode = "chat" | "embedding" | "image" | "decision";

export function executionMode(m: Pick<CatalogModel, "modelType">): ExecutionMode {
  switch (m.modelType) {
    case "embedding": return "embedding";
    case "image_generation": return "image";
    case "evaluation": return "decision";
    default: return "chat";
  }
}

/** Models that can power a Telegram AI agent: text chat models with a reply-style API. PaliGemma is image-captioning only. */
export function canPowerAgent(m: Pick<CatalogModel, "modelType" | "slug">): boolean {
  return executionMode(m) === "chat" && m.slug !== "paligemma";
}
const nv = (publisher: string, id: string) => `https://build.nvidia.com/${publisher}/${id}`;
const vc = (id: string) => `https://vercel.com/ai-gateway/models/${id}`;

type BaseModel = Omit<CatalogModel, "isThinking" | "defaultTemperature" | "defaultMaxTokens">;

const BASE_MODELS: BaseModel[] = [
  {
    slug: "gemma-4-31b-it", name: "Google Gemma 4 31B", providerKey: "google", providerName: "Google", source: "nvidia",
    sourceUrl: nv("google", "gemma-4-31b-it"), apiModelId: "google/gemma-4-31b-it", modelType: "multimodal", badge: "Multimodal",
    description: "A powerful open model for multimodal reasoning, coding and agentic applications.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Function Calling", "Chat"], paramsLabel: "31B", contextTokens: 262144, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA Open Model License; Gemma Apache 2.0 terms", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-04-02", sourceUpdatedAt: "2026-04-02", sortOrder: 10,
  },
  {
    slug: "nemotron-3-5-lightning-30b-a3b", name: "Nemotron 3.5 Lightning 30B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3.5-lightning-30b-a3b"), apiModelId: "nvidia/nemotron-3.5-lightning-30b-a3b", modelType: "chat", badge: "Efficient",
    description: "Fastest 30B A3B mixture-of-experts model with leading domain accuracy for specialized agentic tasks.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: "30B (3B active)", contextTokens: 1000000, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "OpenMDW License 1.1", deployment: ["NVIDIA NIM"], releasedAt: "2026-08-11", sourceUpdatedAt: "2026-08-11", sortOrder: 20,
  },
  {
    slug: "nemotron-3-nano-omni-30b-a3b-reasoning", name: "Nemotron 3 Nano Omni 30B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3-nano-omni-30b-a3b-reasoning"), apiModelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", modelType: "multimodal", badge: "Multimodal",
    description: "Omni-modal reasoning model that understands images, video, speech and text for document, video and GUI workflows.",
    capabilities: ["Reasoning", "OCR", "Transcription", "Agentic"], paramsLabel: "31B (3B active)", contextTokens: 262144, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video", "Audio"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "NVIDIA Open Model Agreement", deployment: ["NVIDIA NIM"], releasedAt: "2026-04-28", sourceUpdatedAt: "2026-04-28", sortOrder: 30,
  },
  {
    slug: "nemotron-3-embed-1b", name: "Nemotron 3 Embed 1B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3-embed-1b"), apiModelId: "nvidia/nemotron-3-embed-1b", modelType: "embedding", badge: "Embeddings",
    description: "1B multilingual embedding model for semantic search, retrieval and RAG applications (2048-dimension vectors, 34 languages evaluated).",
    capabilities: ["Embeddings", "Semantic Search", "RAG"], paramsLabel: "1B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Embedding"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "OpenMDW License 1.1", deployment: ["NVIDIA NIM"], releasedAt: "2026-07-16", sourceUpdatedAt: "2026-07-16", sortOrder: 40,
  },
  {
    slug: "kimi-k3-1-pro", name: "Kimi K3.1 Pro", providerKey: "moonshot", providerName: "Moonshot AI", source: "nvidia",
    sourceUrl: nv("moonshotai", "kimi-k3_1-pro"), apiModelId: "moonshotai/kimi-k3.1-pro", modelType: "multimodal", badge: "Multimodal",
    description: "3T-class open model with 1M-token context, specialized for agentic coding, 3D modeling and finance.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: "2.8T (104B active)", contextTokens: 1048576, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "Kimi K3.1 Pro License; NVIDIA Open Model Agreement", deployment: ["NVIDIA NIM"], releasedAt: "2026-11-04", sourceUpdatedAt: "2026-11-04", sortOrder: 50,
  },
  {
    slug: "glm-5-3-flash", name: "GLM-5.3 Flash", providerKey: "zai", providerName: "Z.ai", source: "nvidia",
    sourceUrl: nv("z-ai", "glm-5-3-flash"), apiModelId: "z-ai/glm-5.3-flash", modelType: "multimodal", badge: "Efficient",
    description: "Multimodal 320B-total / 18B-active MoE with hybrid sparse and linear attention, reasoning and tool calling.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Function Calling", "Chat"], paramsLabel: "320B (18B active)", contextTokens: 1048576, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "MIT", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-08-25", sourceUpdatedAt: "2026-09-15", sortOrder: 60,
  },
  {
    slug: "minimax-m3-1-flash", name: "MiniMax M3.1 Flash", providerKey: "minimax", providerName: "MiniMax", source: "nvidia",
    sourceUrl: nv("minimaxai", "minimax-m3.1-flash"), apiModelId: "minimaxai/minimax-m3.1-flash", modelType: "multimodal", badge: "Agentic",
    description: "Native multimodal MoE for coding, agentic workflows, computer use and cybersecurity with up to 1M tokens of context.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Computer Use"], paramsLabel: "428B (23B active)", contextTokens: 1000000, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: false, isFeatured: false,
    license: "NVIDIA Software and Model Evaluation License (research and development only)", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-10-22", sourceUpdatedAt: "2026-10-20", sortOrder: 70,
  },
  {
    slug: "muse-glimmer-30b", name: "Muse Glimmer 30B", providerKey: "meta", providerName: "Meta", source: "nvidia",
    sourceUrl: nv("meta", "muse-glimmer-30b"), apiModelId: "meta/muse-glimmer-30b", modelType: "multimodal", badge: "Open Source",
    description: "Dense multimodal reasoning model for local agents, coding agents and tool calling, with separate reasoning output.",
    capabilities: ["Reasoning", "Agentic", "Function Calling", "Coding"], paramsLabel: "30B", contextTokens: 131072, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA Open Model Agreement; Apache 2.0 base model", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-08-10", sourceUpdatedAt: "2026-08-10", sortOrder: 80,
  },
  {
    slug: "mistral-large-4-1t-a52b", name: "Mistral Large 4", providerKey: "mistral", providerName: "Mistral AI", source: "nvidia",
    sourceUrl: nv("mistralai", "mistral-large-4-1t-a52b"), apiModelId: "mistralai/mistral-large-4-1t-a52b", modelType: "multimodal", badge: "Multimodal",
    description: "1T-total / 52B-active granular MoE for text and image input with reasoning, function calling and structured outputs.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Function Calling", "Chat"], paramsLabel: "1T (52B active)", contextTokens: 1000000, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: false, isFeatured: false,
    license: "NVIDIA API Trial Terms; contact Mistral to deploy", deployment: ["NVIDIA NIM"], releasedAt: "2026-10-29", sourceUpdatedAt: "2026-10-29", sortOrder: 90,
  },
  {
    slug: "cosmos3-nano", name: "Cosmos3 Nano", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "cosmos3-nano"), apiModelId: "nvidia/cosmos3-nano", modelType: "image_generation", badge: "Image & Video",
    description: "World foundation model that generates images, videos and action predictions for robotics, autonomous vehicles and industrial simulation.",
    capabilities: ["Image Generation", "Video Generation", "Physical AI"], paramsLabel: "16B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Image", "Video"], isFree: true, isOpenSource: false, isFeatured: false,
    license: "NVIDIA API Trial Terms of Service", deployment: ["NVIDIA NIM"], releasedAt: null, sourceUpdatedAt: "2026-06-01", sortOrder: 100,
  },
  {
    slug: "flux-1-schnell", name: "FLUX.1 Schnell", providerKey: "blackforest", providerName: "Black Forest Labs", source: "nvidia",
    sourceUrl: nv("black-forest-labs", "flux_1-schnell"), apiModelId: "black-forest-labs/flux.1-schnell", modelType: "image_generation", badge: "Image Generation",
    description: "Fast 12B image generation model that turns text prompts into high-quality images in 1 to 4 steps.",
    capabilities: ["Image Generation", "Text to Image"], paramsLabel: "12B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Image"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "NVIDIA API Trial Terms of Service; model weights Apache 2.0", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2024-08-01", sourceUpdatedAt: "2025-06-13", sortOrder: 105,
  },  {
    slug: "paligemma", name: "PaliGemma 3B", providerKey: "google", providerName: "Google", source: "nvidia",
    sourceUrl: nv("google", "google-paligemma"), apiModelId: "google/paligemma", modelType: "multimodal", badge: "Vision",
    description: "Compact vision-language model for image captioning and visual question answering.",
    capabilities: ["Vision", "Image Captioning"], paramsLabel: "3B", contextTokens: 8192, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "Google Research license and Acceptable Use Policy", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: null, sourceUpdatedAt: "2024-08-26", sortOrder: 110,
  },
  {
    slug: "glyph-cluster", name: "Glyph Cluster", providerKey: "stealth", providerName: "Stealth", source: "vercel",
    sourceUrl: vc("glyph-cluster"), apiModelId: "stealth/glyph-cluster", modelType: "chat", badge: "Early Access",
    description: "Anonymous reasoning model in early access. Prompts and outputs are retained by the provider.",
    capabilities: ["Reasoning", "Chat"], paramsLabel: null, contextTokens: 256000, maxOutputTokens: 256000,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: false, isOpenSource: false, isFeatured: false,
    license: null, deployment: ["Vercel AI Gateway"], releasedAt: null, sourceUpdatedAt: null, sortOrder: 120,
  },
  {
    slug: "ampersand-v0-1", name: "Ampersand v0.1", providerKey: "humansand", providerName: "Humans&", source: "vercel",
    sourceUrl: vc("ampersand-v0.1"), apiModelId: "humansand/ampersand-v0.1", modelType: "chat", badge: "Collaboration",
    description: "Collaborator model for shared goals, group conversations and long-running collaboration, with function tools and prompt caching.",
    capabilities: ["Chat", "Reasoning", "Function Calling"], paramsLabel: null, contextTokens: 1000000, maxOutputTokens: 32768,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: false, isOpenSource: false, isFeatured: false,
    license: null, deployment: ["Vercel AI Gateway"], releasedAt: null, sourceUpdatedAt: null, sortOrder: 130,
  },
  {
    slug: "parallel-decisions-fast", name: "Decisions Fast", providerKey: "parallel", providerName: "Parallel", source: "vercel",
    sourceUrl: vc("parallel-decisions-fast"), apiModelId: "parallel/parallel-decisions-fast", modelType: "evaluation", badge: "Evaluation",
    description: "Fast classification and scoring grounded in live web evidence. Answers yes/no, multiple-choice and scoring questions with probabilities and citations.",
    capabilities: ["Classification", "Evaluation", "Web Search"], paramsLabel: null, contextTokens: 32000, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: false, isOpenSource: false, isFeatured: false,
    license: null, deployment: ["Vercel AI Gateway"], releasedAt: null, sourceUpdatedAt: null, sortOrder: 140,
  },
  {
    slug: "beam-free", name: "Beam 1.0 (Free)", providerKey: "reflection", providerName: "Reflection", source: "vercel",
    sourceUrl: vc("beam-free"), apiModelId: "reflection/beam-free", modelType: "chat", badge: "Efficient",
    description: "Reasoning model for coding and agentic workflows with fast, low-latency inference.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: null, contextTokens: 1048576, maxOutputTokens: 131072,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: true, isOpenSource: false, isFeatured: false,
    license: null, deployment: ["Vercel AI Gateway"], releasedAt: null, sourceUpdatedAt: null, sortOrder: 150,
  },
];

/**
 * Thinking models are the ones the provider pages call reasoning models (a separate reasoning output or reasoning effort).
 * Nemotron 3.5 Lightning and Nano Omni, and Muse Glimmer, were also seen returning `reasoning_content` from the live API.
 * Gemma 4 can think but runs without a thinking pass by default, so it is not marked. Temperatures follow the provider pages
 * where they state one (Nemotron 3.5 Lightning: 1.0); other thinking models use 0.6.
 */
const TUNING: Record<string, { thinking: boolean; temperature: number; maxTokens: number }> = {
  "gemma-4-31b-it": { thinking: false, temperature: 0.7, maxTokens: 1024 },
  "nemotron-3-5-lightning-30b-a3b": { thinking: true, temperature: 1, maxTokens: 4096 },
  "nemotron-3-nano-omni-30b-a3b-reasoning": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "nemotron-3-embed-1b": { thinking: false, temperature: 0, maxTokens: 256 },
  "kimi-k3-1-pro": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "glm-5-3-flash": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "minimax-m3-1-flash": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "muse-glimmer-30b": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "mistral-large-4-1t-a52b": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "cosmos3-nano": { thinking: false, temperature: 0, maxTokens: 256 },
  paligemma: { thinking: false, temperature: 0.2, maxTokens: 256 },
  "flux-1-schnell": { thinking: false, temperature: 0, maxTokens: 256 },
  "glyph-cluster": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "ampersand-v0-1": { thinking: true, temperature: 0.6, maxTokens: 4096 },
  "parallel-decisions-fast": { thinking: false, temperature: 0, maxTokens: 256 },
  "beam-free": { thinking: true, temperature: 0.6, maxTokens: 4096 },
};

export const MODEL_CATALOG: CatalogModel[] = BASE_MODELS.map((m) => {
  const t = TUNING[m.slug] ?? { thinking: false, temperature: 0.5, maxTokens: 1024 };
  return { ...m, isThinking: t.thinking, defaultTemperature: t.temperature, defaultMaxTokens: t.maxTokens };
});
