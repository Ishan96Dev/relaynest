/**
 * Source of truth for the AI Model Catalog seed. `pnpm models:sql` renders this list into the
 * `ai_models` seed migration, and the catalog page falls back to it when Supabase is not configured.
 * Facts come from the public NVIDIA Build and Vercel AI Gateway model pages linked in `sourceUrl`.
 */
export type ModelType = "chat" | "multimodal" | "embedding" | "image_generation" | "evaluation";
export type ModelSource = "nvidia" | "vercel";

/** Provider connection metadata stored in Supabase `public.ai_providers` (with demo fallback below). */
export interface ProviderRecord {
  source: ModelSource;
  displayName: string;
  chatBaseUrl: string;
  mediaBaseUrl: string | null;
  envKeyName: string;
  supportsThinkingToggle: boolean;
  isActive: boolean;
}

export const PROVIDER_CATALOG: ProviderRecord[] = [
  {
    source: "nvidia",
    displayName: "NVIDIA Build",
    chatBaseUrl: "https://integrate.api.nvidia.com/v1",
    mediaBaseUrl: "https://ai.api.nvidia.com/v1",
    envKeyName: "NVIDIA_API_KEY",
    supportsThinkingToggle: true,
    isActive: true,
  },
  {
    source: "vercel",
    displayName: "Vercel AI Gateway",
    chatBaseUrl: "https://ai-gateway.vercel.sh/v1",
    mediaBaseUrl: null,
    envKeyName: "AI_GATEWAY_API_KEY",
    supportsThinkingToggle: false,
    isActive: true,
  },
];

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
  /** Whether the model is live for selection in Catalog/Playground/Wizard (false = legacy/retired, auto-routes via fallbackModelSlug). */
  isActive?: boolean;
  /** DB-configured fallback model slug when this model is retired or preview-limited. */
  fallbackModelSlug?: string | null;
  /** Upstream path relative to provider base URL (e.g. '/chat/completions', '/genai/black-forest-labs/flux.1-schnell'). */
  endpointPath?: string | null;
  /** Reasoning model: supports optional deep-thinking pass. */
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

/** Models that accept an image attachment in chat (multimodal VLMs and PaliGemma). */
export function supportsImageInput(m: Pick<CatalogModel, "inputModalities" | "slug">): boolean {
  return m.inputModalities.includes("Image") || m.slug === "paligemma";
}
const nv = (publisher: string, id: string) => `https://build.nvidia.com/${publisher}/${id}`;
const vc = (id: string) => `https://vercel.com/ai-gateway/models/${id}`;

type BaseModel = Omit<CatalogModel, "isThinking" | "defaultTemperature" | "defaultMaxTokens">;

const BASE_MODELS: BaseModel[] = [
  {
    slug: "nemotron-3-5-lightning-30b-a3b", name: "Nemotron 3.5 Lightning 30B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3.5-lightning-30b-a3b"), apiModelId: "nvidia/nemotron-3.5-lightning-30b-a3b", modelType: "chat", badge: "Fastest",
    description: "Ultra-fast 30B A3B mixture-of-experts model with low-latency responses and strong domain accuracy for chat, RAG and agentic tasks.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: "30B (3B active)", contextTokens: 1000000, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "OpenMDW License 1.1", deployment: ["NVIDIA NIM"], releasedAt: "2026-08-11", sourceUpdatedAt: "2026-08-11", sortOrder: 10,
  },
  {
    slug: "nemotron-3-5-super-vl-120b-a12b", name: "Nemotron 3.5 Super VL 120B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3.5-super-vl-120b-a12b"), apiModelId: "nvidia/nemotron-3.5-super-vl-120b-a12b", modelType: "multimodal", badge: "Vision & Chat",
    description: "High-accuracy 120B (12B active) vision-language model for detailed chart analysis, OCR, document understanding, coding and multimodal chat.",
    capabilities: ["Vision", "OCR", "Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: "120B (12B active)", contextTokens: 262144, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA Open Model Agreement", deployment: ["NVIDIA NIM"], releasedAt: "2026-09-18", sourceUpdatedAt: "2026-11-20", sortOrder: 12,
  },
  {
    slug: "nemotron-3-5-bolt-e4b", name: "Nemotron 3.5 Bolt E4B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3.5-bolt-e4b"), apiModelId: "nvidia/nemotron-3.5-bolt-e4b", modelType: "multimodal", badge: "Ultra Fast",
    description: "Sub-second multimodal model tuned for instant Telegram replies, fast vision OCR and high-throughput RAG chat.",
    capabilities: ["Vision", "OCR", "Reasoning", "Chat"], paramsLabel: "4B effective", contextTokens: 131072, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA Open Model Agreement", deployment: ["NVIDIA NIM"], releasedAt: "2026-10-10", sourceUpdatedAt: "2026-11-20", sortOrder: 15,
  },
  {
    slug: "nemotron-3-nano-omni-30b-a3b-reasoning", name: "Nemotron 3 Nano Omni 30B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3-nano-omni-30b-a3b-reasoning"), apiModelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", modelType: "multimodal", badge: "Multimodal",
    description: "Omni-modal reasoning model that understands images, video, speech and text for document, chart and GUI workflows.",
    capabilities: ["Vision", "Reasoning", "OCR", "Transcription", "Agentic", "Chat"], paramsLabel: "31B (3B active)", contextTokens: 262144, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video", "Audio"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA Open Model Agreement", deployment: ["NVIDIA NIM"], releasedAt: "2026-04-28", sourceUpdatedAt: "2026-04-28", sortOrder: 18,
  },
  {
    slug: "nemotron-3-embed-1b", name: "Nemotron 3.5 Embed 1B", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "nemotron-3.5-embed-1b"), apiModelId: "nvidia/nemotron-3.5-embed-1b", modelType: "embedding", badge: "Embeddings",
    description: "1B multilingual embedding model for semantic search, retrieval and RAG applications (2048-dimension vectors).",
    capabilities: ["Embeddings", "Semantic Search", "RAG"], paramsLabel: "1B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Embedding"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "OpenMDW License 1.1", deployment: ["NVIDIA NIM"], releasedAt: "2026-07-16", sourceUpdatedAt: "2026-11-24", sortOrder: 40,
  },
  {
    slug: "kimi-k3-1-pro", name: "Kimi K3.1 Pro", providerKey: "moonshot", providerName: "Moonshot AI", source: "nvidia",
    sourceUrl: nv("moonshotai", "kimi-k3_1-pro"), apiModelId: "moonshotai/kimi-k3.1-pro", modelType: "multimodal", badge: "Multimodal",
    description: "3T-class open model with 1M-token context, specialized for agentic coding, 3D modeling and finance.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Chat"], paramsLabel: "2.8T (104B active)", contextTokens: 1048576, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
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
    slug: "mistral-large-4-1t-a52b", name: "Mistral Large 4", providerKey: "mistral", providerName: "Mistral AI", source: "nvidia",
    sourceUrl: nv("mistralai", "mistral-large-4-1t-a52b"), apiModelId: "mistralai/mistral-large-4-1t-a52b", modelType: "multimodal", badge: "Multimodal",
    description: "1T-total / 52B-active granular MoE for text and image input with reasoning, function calling and structured outputs.",
    capabilities: ["Reasoning", "Coding", "Agentic", "Function Calling", "Chat"], paramsLabel: "1T (52B active)", contextTokens: 1000000, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: false, isFeatured: false,
    license: "NVIDIA API Trial Terms; contact Mistral to deploy", deployment: ["NVIDIA NIM"], releasedAt: "2026-10-29", sourceUpdatedAt: "2026-10-29", sortOrder: 90,
  },
  {
    slug: "flux-1-schnell", name: "FLUX.1 Schnell", providerKey: "blackforest", providerName: "Black Forest Labs", source: "nvidia",
    sourceUrl: nv("black-forest-labs", "flux_1-schnell"), apiModelId: "black-forest-labs/flux.1-schnell", modelType: "image_generation", badge: "Image Generation",
    description: "Fast 12B image generation model that turns text prompts into high-quality 1024x1024 images in 4 steps.",
    capabilities: ["Image Generation", "Text to Image"], paramsLabel: "12B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text"], outputModalities: ["Image"], isFree: true, isOpenSource: true, isFeatured: true,
    license: "NVIDIA API Trial Terms of Service; model weights Apache 2.0", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2024-08-01", sourceUpdatedAt: "2025-06-13", sortOrder: 95,
  },
  {
    slug: "cosmos3-nano", name: "Cosmos3 Nano", providerKey: "nvidia", providerName: "NVIDIA", source: "nvidia",
    sourceUrl: nv("nvidia", "cosmos3-nano"), apiModelId: "nvidia/cosmos3-nano", modelType: "image_generation", badge: "Image & Video",
    description: "World foundation model for image generation (automatically routes through FLUX.1 Schnell when Cosmos3 preview is unavailable).",
    capabilities: ["Image Generation", "Video Generation", "Physical AI"], paramsLabel: "16B", contextTokens: null, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Image", "Video"], isFree: true, isOpenSource: false, isFeatured: false,
    license: "NVIDIA API Trial Terms of Service", deployment: ["NVIDIA NIM"], releasedAt: null, sourceUpdatedAt: "2026-06-01", sortOrder: 108,
  },
  {
    slug: "paligemma", name: "PaliGemma 3B", providerKey: "google", providerName: "Google", source: "nvidia",
    sourceUrl: nv("google", "google-paligemma"), apiModelId: "google/paligemma", modelType: "multimodal", badge: "Vision",
    description: "Compact vision-language model for image captioning and visual question answering (upgraded with automatic Super VL fallback).",
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
  {
    slug: "gemma-4-31b-it", name: "Google Gemma 4 31B", providerKey: "google", providerName: "Google", source: "nvidia",
    sourceUrl: nv("google", "gemma-4-31b-it"), apiModelId: "google/gemma-4-31b-it", modelType: "multimodal", badge: "Legacy",
    description: "Legacy Google multimodal model (routes automatically to Nemotron 3.5 Super VL on NVIDIA Build).",
    capabilities: ["Reasoning", "Coding", "Agentic", "Function Calling", "Chat"], paramsLabel: "31B", contextTokens: 262144, maxOutputTokens: null,
    inputModalities: ["Text", "Image", "Video"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "NVIDIA Open Model License; Gemma Apache 2.0 terms", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-04-02", sourceUpdatedAt: "2026-11-24", sortOrder: 160,
  },
  {
    slug: "muse-glimmer-30b", name: "Muse Glimmer 30B", providerKey: "meta", providerName: "Meta", source: "nvidia",
    sourceUrl: nv("meta", "muse-glimmer-30b"), apiModelId: "meta/muse-glimmer-30b", modelType: "multimodal", badge: "Legacy",
    description: "Legacy Meta multimodal reasoning model (routes automatically to Nemotron 3.5 Super VL on NVIDIA Build).",
    capabilities: ["Reasoning", "Agentic", "Function Calling", "Coding"], paramsLabel: "30B", contextTokens: 131072, maxOutputTokens: null,
    inputModalities: ["Text", "Image"], outputModalities: ["Text"], isFree: true, isOpenSource: true, isFeatured: false,
    license: "NVIDIA Open Model Agreement; Apache 2.0 base model", deployment: ["NVIDIA NIM", "Hugging Face"], releasedAt: "2026-08-10", sourceUpdatedAt: "2026-11-24", sortOrder: 165,
  },
];

/**
 * Tuning defaults per model. Reasoning models run in fast (low-latency) mode unless deep thinking is requested,
 * keeping interactive Playground and Telegram replies crisp (under 1-2s).
 */
const TUNING: Record<string, { thinking: boolean; temperature: number; maxTokens: number }> = {
  "nemotron-3-5-lightning-30b-a3b": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "nemotron-3-5-super-vl-120b-a12b": { thinking: true, temperature: 0.5, maxTokens: 2048 },
  "nemotron-3-5-bolt-e4b": { thinking: true, temperature: 0.5, maxTokens: 2048 },
  "nemotron-3-nano-omni-30b-a3b-reasoning": { thinking: true, temperature: 0.5, maxTokens: 2048 },
  "nemotron-3-embed-1b": { thinking: false, temperature: 0, maxTokens: 256 },
  "kimi-k3-1-pro": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "glm-5-3-flash": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "minimax-m3-1-flash": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "mistral-large-4-1t-a52b": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "flux-1-schnell": { thinking: false, temperature: 0, maxTokens: 256 },
  "cosmos3-nano": { thinking: false, temperature: 0, maxTokens: 256 },
  paligemma: { thinking: false, temperature: 0.2, maxTokens: 512 },
  "glyph-cluster": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "ampersand-v0-1": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "parallel-decisions-fast": { thinking: false, temperature: 0, maxTokens: 256 },
  "beam-free": { thinking: true, temperature: 0.6, maxTokens: 2048 },
  "gemma-4-31b-it": { thinking: false, temperature: 0.6, maxTokens: 1024 },
  "muse-glimmer-30b": { thinking: true, temperature: 0.6, maxTokens: 2048 },
};

const ROUTING: Record<string, { isActive: boolean; fallbackModelSlug: string | null; endpointPath: string }> = {
  "nemotron-3-embed-1b": { isActive: true, fallbackModelSlug: null, endpointPath: "/embeddings" },
  "flux-1-schnell": { isActive: true, fallbackModelSlug: null, endpointPath: "/genai/black-forest-labs/flux.1-schnell" },
  "cosmos3-nano": { isActive: true, fallbackModelSlug: "flux-1-schnell", endpointPath: "/cosmos/nvidia/cosmos3-nano" },
  paligemma: { isActive: true, fallbackModelSlug: "nemotron-3-5-super-vl-120b-a12b", endpointPath: "/vlm/google/paligemma" },
  "parallel-decisions-fast": { isActive: true, fallbackModelSlug: null, endpointPath: "/decisions" },
  "gemma-4-31b-it": { isActive: false, fallbackModelSlug: "nemotron-3-5-super-vl-120b-a12b", endpointPath: "/chat/completions" },
  "muse-glimmer-30b": { isActive: false, fallbackModelSlug: "nemotron-3-5-super-vl-120b-a12b", endpointPath: "/chat/completions" },
};

export const MODEL_CATALOG: CatalogModel[] = BASE_MODELS.map((m) => {
  const t = TUNING[m.slug] ?? { thinking: false, temperature: 0.5, maxTokens: 1024 };
  const r = ROUTING[m.slug] ?? { isActive: true, fallbackModelSlug: null, endpointPath: "/chat/completions" };
  return {
    ...m,
    isThinking: t.thinking,
    defaultTemperature: t.temperature,
    defaultMaxTokens: t.maxTokens,
    isActive: r.isActive,
    fallbackModelSlug: r.fallbackModelSlug,
    endpointPath: r.endpointPath,
  };
});
