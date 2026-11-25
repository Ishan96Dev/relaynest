import { PROVIDER_CATALOG, type ModelDto } from "@backend/server/ai/model-catalog";

/** 262144 -> "256K", 1000000 -> "1M", 32000 -> "32K". Binary sizes (8192, 262144) read as the K/M the vendors quote. */
export function formatTokens(n: number | null): string {
  if (!n) return "N/A";
  const trim = (v: number) => String(Math.round(v * 10) / 10).replace(/\.0$/, "");
  if (n >= 1_000_000) return `${trim(n % 1_048_576 === 0 ? n / 1_048_576 : n / 1_000_000)}M`;
  return `${trim(n % 1024 === 0 ? n / 1024 : n / 1000)}K`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Text, Image, Video" with the vendor-neutral input list used on cards and in the detail panel. */
export const listModalities = (m: string[]) => m.join(", ");
export const joinModalities = (m: string[]) => m.join(" \u2022 ");

export type FilterId = "all" | "free" | "open" | "thinking" | "reasoning" | "coding" | "chat" | "embeddings" | "image" | "multimodal";

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All Models" },
  { id: "free", label: "Free Models" },
  { id: "open", label: "Open Source" },
  { id: "thinking", label: "Thinking" },
  { id: "reasoning", label: "Reasoning" },
  { id: "coding", label: "Coding" },
  { id: "chat", label: "Chat" },
  { id: "embeddings", label: "Embeddings" },
  { id: "image", label: "Image Generation" },
  { id: "multimodal", label: "Multimodal" },
];

export function matchesFilter(m: ModelDto, f: FilterId): boolean {
  switch (f) {
    case "all": return true;
    case "free": return m.isFree;
    case "open": return m.isOpenSource;
    case "thinking": return m.isThinking;
    case "reasoning": return m.capabilities.includes("Reasoning");
    case "coding": return m.capabilities.includes("Coding");
    case "chat": return m.capabilities.includes("Chat");
    case "embeddings": return m.modelType === "embedding";
    case "image": return m.modelType === "image_generation";
    case "multimodal": return m.inputModalities.length > 1;
  }
}

export function matchesQuery(m: ModelDto, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${m.name} ${m.providerName} ${m.apiModelId} ${m.description} ${m.capabilities.join(" ")} ${m.modelType}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Short availability label shown on cards and in the detail panel. */
export function availabilityLabel(m: ModelDto): string {
  if (m.isFree) return "Free Endpoint";
  if (m.isOpenSource) return "Open Source";
  return m.source === "vercel" ? "AI Gateway" : "Preview";
}

export type Lang = "python" | "node" | "curl";

export interface ApiRequest { url: string; keyName: string; body: unknown }

/** The real upstream request for the model, built from DB-backed provider and endpoint metadata. */
export function apiRequest(m: ModelDto): ApiRequest {
  const provider = PROVIDER_CATALOG.find((p) => p.source === m.source) ?? PROVIDER_CATALOG[0]!;
  const nvidia = m.source === "nvidia";
  const keyName = provider.envKeyName;
  const chatBase = provider.chatBaseUrl;
  const mediaBase = provider.mediaBaseUrl ?? chatBase;
  const chat = [{ role: "user", content: "Explain RAG in simple terms." }];
  if (m.modelType === "embedding") {
    return { keyName, url: `${chatBase}${m.endpointPath ?? "/embeddings"}`,
      body: { model: m.apiModelId, input: "RelayNest helps teams build Telegram bots.", ...(nvidia ? { input_type: "query", truncate: "END" } : {}) } };
  }
  if (m.modelType === "image_generation" && m.apiModelId.includes("flux")) {
    return { keyName, url: `${mediaBase}${m.endpointPath ?? `/genai/${m.apiModelId}`}`, body: { prompt: "A cat sitting on a windowsill at sunset", width: 1024, height: 1024, steps: 4 } };
  }
  if (m.modelType === "image_generation") {
    return { keyName, url: `${mediaBase}${m.endpointPath ?? `/cosmos/${m.apiModelId}`}`, body: { model_mode: "text2image", prompt: "A robotic arm picks up a component on a workbench", resolution: "480_1_1" } };
  }
  if (m.modelType === "evaluation") {
    return { keyName, url: `${chatBase}${m.endpointPath ?? "/decisions"}`,
      body: { model: m.apiModelId, input: "The package arrived with a broken screen.", questions: [{ type: "predicate", name: "damaged", instructions: "Does the customer report a damaged item?" }] } };
  }
  if (m.slug === "paligemma") {
    return { keyName, url: `${mediaBase}${m.endpointPath ?? `/vlm/${m.apiModelId}`}`, body: { messages: [{ role: "user", content: "Describe this image. <img src=\"data:image/jpeg;base64,<BASE64_IMAGE>\" />" }], max_tokens: 256 } };
  }
  return { keyName, url: `${chatBase}${m.endpointPath ?? "/chat/completions"}`,
    body: { model: m.apiModelId, messages: chat, max_tokens: 512 } };
}

/** Copy-paste example that calls the model's upstream API directly with your own key. */
export function quickStart(m: ModelDto, lang: Lang): string {
  const { url, keyName, body } = apiRequest(m);
  const json = JSON.stringify(body, null, 2);
  if (lang === "python") {
    return `# ${m.name} via ${m.source === "nvidia" ? "NVIDIA Build" : "Vercel AI Gateway"}\nimport os\nimport requests\n\nresponse = requests.post(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['${keyName}']}"},\n    json=${json.replace(/\n/g, "\n    ")},\n)\nprint(response.json())`;
  }
  if (lang === "node") {
    return `// ${m.name} via ${m.source === "nvidia" ? "NVIDIA Build" : "Vercel AI Gateway"}\nconst response = await fetch("${url}", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.${keyName}}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json.replace(/\n/g, "\n  ")}),\n});\nconsole.log(await response.json());`;
  }
  return `# ${m.name} via ${m.source === "nvidia" ? "NVIDIA Build" : "Vercel AI Gateway"}\ncurl -X POST "${url}" \\\n  -H "Authorization: Bearer $${keyName}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body)}'`;
}
export function keyCapabilities(m: ModelDto): string[] {
  const out: string[] = [];
  if (m.capabilities.includes("Function Calling")) out.push("Function Calling");
  if (m.capabilities.includes("Reasoning")) out.push("Reasoning");
  if (m.inputModalities.length > 1) out.push(`Multimodal (${listModalities(m.inputModalities)})`);
  if (m.contextTokens && m.contextTokens >= 200_000) out.push(`Long Context (${formatTokens(m.contextTokens)})`);
  if (m.modelType === "embedding") out.push("Multilingual embeddings");
  if (m.modelType === "image_generation") out.push("Image and video generation");
  for (const c of m.capabilities) {
    if (out.length >= 5) break;
    if (!["Function Calling", "Reasoning", "Chat", "Embeddings"].includes(c) && !out.some((o) => o.startsWith(c))) out.push(c);
  }
  return out.slice(0, 5);
}
