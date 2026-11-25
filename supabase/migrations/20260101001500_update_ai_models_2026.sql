-- Move all AI provider endpoints, model activation state, endpoint paths, and fallback routing into Supabase DB.

-- ---------- AI providers registry ----------
create table if not exists public.ai_providers (
  source text primary key check (source ~ '^[a-z0-9_-]{2,40}$'),
  display_name text not null,
  chat_base_url text not null,
  media_base_url text,
  env_key_name text not null,
  supports_thinking_toggle boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_providers_updated on public.ai_providers;
create trigger ai_providers_updated before update on public.ai_providers
  for each row execute function public.set_updated_at();

alter table public.ai_providers enable row level security;
drop policy if exists "providers readable" on public.ai_providers;
create policy "providers readable" on public.ai_providers for select to authenticated using (true);
revoke all on public.ai_providers from anon, authenticated;
grant select on public.ai_providers to authenticated;

insert into public.ai_providers (source, display_name, chat_base_url, media_base_url, env_key_name, supports_thinking_toggle, is_active) values
  ('nvidia', 'NVIDIA Build', 'https://integrate.api.nvidia.com/v1', 'https://ai.api.nvidia.com/v1', 'NVIDIA_API_KEY', true, true),
  ('vercel', 'Vercel AI Gateway', 'https://ai-gateway.vercel.sh/v1', null, 'AI_GATEWAY_API_KEY', false, true)
on conflict (source) do update set
  display_name = excluded.display_name,
  chat_base_url = excluded.chat_base_url,
  media_base_url = excluded.media_base_url,
  env_key_name = excluded.env_key_name,
  supports_thinking_toggle = excluded.supports_thinking_toggle,
  is_active = excluded.is_active;

-- ---------- AI models operational routing columns ----------
alter table public.ai_models
  add column if not exists is_active boolean not null default true,
  add column if not exists fallback_model_slug text references public.ai_models(slug) on delete set null,
  add column if not exists endpoint_path text;

create index if not exists ai_models_active_sort_idx on public.ai_models (is_active, model_type, sort_order);

-- Upsert active & legacy models first (with fallback_model_slug null so FK targets exist before linking).
insert into public.ai_models (
  slug, name, provider_key, provider_name, source, source_url, api_model_id, model_type, badge, description,
  capabilities, params_label, context_tokens, max_output_tokens, input_modalities, output_modalities,
  is_free, is_open_source, is_featured, is_thinking, default_temperature, default_max_tokens,
  license, deployment, released_at, source_updated_at, sort_order, is_active, endpoint_path
) values
  ('nemotron-3-5-lightning-30b-a3b', 'Nemotron 3.5 Lightning 30B', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia/nemotron-3.5-lightning-30b-a3b', 'chat', 'Fastest', 'Ultra-fast 30B A3B mixture-of-experts model with low-latency responses and strong domain accuracy for chat, RAG and agentic tasks.', array['Reasoning', 'Coding', 'Agentic', 'Chat']::text[], '30B (3B active)', 1000000, null, array['Text']::text[], array['Text']::text[], true, true, true, true, 0.6, 1024, 'OpenMDW License 1.1', array['NVIDIA NIM']::text[], date '2026-08-11', date '2026-08-11', 10, true, '/chat/completions'),
  ('nemotron-3-5-super-vl-120b-a12b', 'Nemotron 3.5 Super VL 120B', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b', 'nvidia/nemotron-3.5-super-vl-120b-a12b', 'multimodal', 'Vision & Chat', 'High-accuracy 120B (12B active) vision-language model for detailed chart analysis, OCR, document understanding, coding and multimodal chat.', array['Vision', 'OCR', 'Reasoning', 'Coding', 'Agentic', 'Chat']::text[], '120B (12B active)', 262144, null, array['Text', 'Image', 'Video']::text[], array['Text']::text[], true, true, true, true, 0.5, 1536, 'NVIDIA Open Model Agreement', array['NVIDIA NIM']::text[], date '2026-09-18', date '2026-11-20', 12, true, '/chat/completions'),
  ('nemotron-3-5-bolt-e4b', 'Nemotron 3.5 Bolt E4B', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b', 'nvidia/nemotron-3.5-bolt-e4b', 'multimodal', 'Ultra Fast', 'Sub-second multimodal model tuned for instant Telegram replies, fast vision OCR and high-throughput RAG chat.', array['Vision', 'OCR', 'Reasoning', 'Chat']::text[], '4B effective', 131072, null, array['Text', 'Image']::text[], array['Text']::text[], true, true, true, true, 0.5, 1024, 'NVIDIA Open Model Agreement', array['NVIDIA NIM']::text[], date '2026-10-10', date '2026-11-20', 15, true, '/chat/completions'),
  ('nemotron-3-nano-omni-30b-a3b-reasoning', 'Nemotron 3 Nano Omni 30B', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'multimodal', 'Multimodal', 'Omni-modal reasoning model that understands images, video, speech and text for document, chart and GUI workflows.', array['Vision', 'Reasoning', 'OCR', 'Transcription', 'Agentic', 'Chat']::text[], '31B (3B active)', 262144, null, array['Text', 'Image', 'Video', 'Audio']::text[], array['Text']::text[], true, true, true, true, 0.5, 1024, 'NVIDIA Open Model Agreement', array['NVIDIA NIM']::text[], date '2026-04-28', date '2026-04-28', 18, true, '/chat/completions'),
  ('nemotron-3-embed-1b', 'Nemotron 3.5 Embed 1B', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/nemotron-3.5-embed-1b', 'nvidia/nemotron-3.5-embed-1b', 'embedding', 'Embeddings', '1B multilingual embedding model for semantic search, retrieval and RAG applications (2048-dimension vectors).', array['Embeddings', 'Semantic Search', 'RAG']::text[], '1B', null, null, array['Text']::text[], array['Embedding']::text[], true, true, false, false, 0, 256, 'OpenMDW License 1.1', array['NVIDIA NIM']::text[], date '2026-07-16', date '2026-11-24', 40, true, '/embeddings'),
  ('kimi-k3-1-pro', 'Kimi K3.1 Pro', 'moonshot', 'Moonshot AI', 'nvidia', 'https://build.nvidia.com/moonshotai/kimi-k3_1-pro', 'moonshotai/kimi-k3.1-pro', 'multimodal', 'Multimodal', '3T-class open model with 1M-token context, specialized for agentic coding, 3D modeling and finance.', array['Reasoning', 'Coding', 'Agentic', 'Chat']::text[], '2.8T (104B active)', 1048576, null, array['Text', 'Image', 'Video']::text[], array['Text']::text[], true, true, false, true, 0.6, 2048, 'Kimi K3.1 Pro License; NVIDIA Open Model Agreement', array['NVIDIA NIM']::text[], date '2026-11-04', date '2026-11-04', 50, true, '/chat/completions'),
  ('glm-5-3-flash', 'GLM-5.3 Flash', 'zai', 'Z.ai', 'nvidia', 'https://build.nvidia.com/z-ai/glm-5-3-flash', 'z-ai/glm-5.3-flash', 'multimodal', 'Efficient', 'Multimodal 320B-total / 18B-active MoE with hybrid sparse and linear attention, reasoning and tool calling.', array['Reasoning', 'Coding', 'Agentic', 'Function Calling', 'Chat']::text[], '320B (18B active)', 1048576, null, array['Text', 'Image']::text[], array['Text']::text[], true, true, false, true, 0.6, 2048, 'MIT', array['NVIDIA NIM', 'Hugging Face']::text[], date '2026-08-25', date '2026-09-15', 60, true, '/chat/completions'),
  ('minimax-m3-1-flash', 'MiniMax M3.1 Flash', 'minimax', 'MiniMax', 'nvidia', 'https://build.nvidia.com/minimaxai/minimax-m3.1-flash', 'minimaxai/minimax-m3.1-flash', 'multimodal', 'Agentic', 'Native multimodal MoE for coding, agentic workflows, computer use and cybersecurity with up to 1M tokens of context.', array['Reasoning', 'Coding', 'Agentic', 'Computer Use']::text[], '428B (23B active)', 1000000, null, array['Text', 'Image']::text[], array['Text']::text[], true, false, false, true, 0.6, 2048, 'NVIDIA Software and Model Evaluation License (research and development only)', array['NVIDIA NIM', 'Hugging Face']::text[], date '2026-10-22', date '2026-10-20', 70, true, '/chat/completions'),
  ('mistral-large-4-1t-a52b', 'Mistral Large 4', 'mistral', 'Mistral AI', 'nvidia', 'https://build.nvidia.com/mistralai/mistral-large-4-1t-a52b', 'mistralai/mistral-large-4-1t-a52b', 'multimodal', 'Multimodal', '1T-total / 52B-active granular MoE for text and image input with reasoning, function calling and structured outputs.', array['Reasoning', 'Coding', 'Agentic', 'Function Calling', 'Chat']::text[], '1T (52B active)', 1000000, null, array['Text', 'Image']::text[], array['Text']::text[], true, false, false, true, 0.6, 2048, 'NVIDIA API Trial Terms; contact Mistral to deploy', array['NVIDIA NIM']::text[], date '2026-10-29', date '2026-10-29', 90, true, '/chat/completions'),
  ('flux-1-schnell', 'FLUX.1 Schnell', 'blackforest', 'Black Forest Labs', 'nvidia', 'https://build.nvidia.com/black-forest-labs/flux_1-schnell', 'black-forest-labs/flux.1-schnell', 'image_generation', 'Image Generation', 'Fast 12B image generation model that turns text prompts into high-quality 1024x1024 images in 4 steps.', array['Image Generation', 'Text to Image']::text[], '12B', null, null, array['Text']::text[], array['Image']::text[], true, true, true, false, 0, 256, 'NVIDIA API Trial Terms of Service; model weights Apache 2.0', array['NVIDIA NIM', 'Hugging Face']::text[], date '2024-08-01', date '2025-06-13', 95, true, '/genai/black-forest-labs/flux.1-schnell'),
  ('cosmos3-nano', 'Cosmos3 Nano', 'nvidia', 'NVIDIA', 'nvidia', 'https://build.nvidia.com/nvidia/cosmos3-nano', 'nvidia/cosmos3-nano', 'image_generation', 'Image & Video', 'World foundation model for image generation (automatically routes through FLUX.1 Schnell when Cosmos3 preview is unavailable).', array['Image Generation', 'Video Generation', 'Physical AI']::text[], '16B', null, null, array['Text', 'Image', 'Video']::text[], array['Image', 'Video']::text[], true, false, false, false, 0, 256, 'NVIDIA API Trial Terms of Service', array['NVIDIA NIM']::text[], null, date '2026-06-01', 108, true, '/cosmos/nvidia/cosmos3-nano'),
  ('paligemma', 'PaliGemma 3B', 'google', 'Google', 'nvidia', 'https://build.nvidia.com/google/google-paligemma', 'google/paligemma', 'multimodal', 'Vision', 'Compact vision-language model for image captioning and visual question answering (upgraded with automatic Super VL fallback).', array['Vision', 'Image Captioning']::text[], '3B', 8192, null, array['Text', 'Image']::text[], array['Text']::text[], true, true, false, false, 0.2, 512, 'Google Research license and Acceptable Use Policy', array['NVIDIA NIM', 'Hugging Face']::text[], null, date '2024-08-26', 110, true, '/vlm/google/paligemma'),
  ('glyph-cluster', 'Glyph Cluster', 'stealth', 'Stealth', 'vercel', 'https://vercel.com/ai-gateway/models/glyph-cluster', 'stealth/glyph-cluster', 'chat', 'Early Access', 'Anonymous reasoning model in early access. Prompts and outputs are retained by the provider.', array['Reasoning', 'Chat']::text[], null, 256000, 256000, array['Text']::text[], array['Text']::text[], false, false, false, true, 0.6, 2048, null, array['Vercel AI Gateway']::text[], null, null, 120, true, '/chat/completions'),
  ('ampersand-v0-1', 'Ampersand v0.1', 'humansand', 'Humans&', 'vercel', 'https://vercel.com/ai-gateway/models/ampersand-v0.1', 'humansand/ampersand-v0.1', 'chat', 'Collaboration', 'Collaborator model for shared goals, group conversations and long-running collaboration, with function tools and prompt caching.', array['Chat', 'Reasoning', 'Function Calling']::text[], null, 1000000, 32768, array['Text']::text[], array['Text']::text[], false, false, false, true, 0.6, 2048, null, array['Vercel AI Gateway']::text[], null, null, 130, true, '/chat/completions'),
  ('parallel-decisions-fast', 'Decisions Fast', 'parallel', 'Parallel', 'vercel', 'https://vercel.com/ai-gateway/models/parallel-decisions-fast', 'parallel/parallel-decisions-fast', 'evaluation', 'Evaluation', 'Fast classification and scoring grounded in live web evidence. Answers yes/no, multiple-choice and scoring questions with probabilities and citations.', array['Classification', 'Evaluation', 'Web Search']::text[], null, 32000, null, array['Text']::text[], array['Text']::text[], false, false, false, false, 0, 256, null, array['Vercel AI Gateway']::text[], null, null, 140, true, '/decisions'),
  ('beam-free', 'Beam 1.0 (Free)', 'reflection', 'Reflection', 'vercel', 'https://vercel.com/ai-gateway/models/beam-free', 'reflection/beam-free', 'chat', 'Efficient', 'Reasoning model for coding and agentic workflows with fast, low-latency inference.', array['Reasoning', 'Coding', 'Agentic', 'Chat']::text[], null, 1048576, 131072, array['Text']::text[], array['Text']::text[], true, false, false, true, 0.6, 2048, null, array['Vercel AI Gateway']::text[], null, null, 150, true, '/chat/completions'),
  ('gemma-4-31b-it', 'Google Gemma 4 31B', 'google', 'Google', 'nvidia', 'https://build.nvidia.com/google/gemma-4-31b-it', 'google/gemma-4-31b-it', 'multimodal', 'Legacy', 'Legacy Google multimodal model (routes automatically to Nemotron 3.5 Super VL on NVIDIA Build).', array['Reasoning', 'Coding', 'Agentic', 'Function Calling', 'Chat']::text[], '31B', 262144, null, array['Text', 'Image', 'Video']::text[], array['Text']::text[], true, true, false, false, 0.6, 1024, 'NVIDIA Open Model License; Gemma Apache 2.0 terms', array['NVIDIA NIM', 'Hugging Face']::text[], date '2026-04-02', date '2026-11-24', 160, false, '/chat/completions'),
  ('muse-glimmer-30b', 'Muse Glimmer 30B', 'meta', 'Meta', 'nvidia', 'https://build.nvidia.com/meta/muse-glimmer-30b', 'meta/muse-glimmer-30b', 'multimodal', 'Legacy', 'Legacy Meta multimodal reasoning model (routes automatically to Nemotron 3.5 Super VL on NVIDIA Build).', array['Reasoning', 'Agentic', 'Function Calling', 'Coding']::text[], '30B', 131072, null, array['Text', 'Image']::text[], array['Text']::text[], true, true, false, true, 0.6, 2048, 'NVIDIA Open Model Agreement; Apache 2.0 base model', array['NVIDIA NIM', 'Hugging Face']::text[], date '2026-08-10', date '2026-11-24', 165, false, '/chat/completions')
on conflict (slug) do update set
  name = excluded.name,
  provider_key = excluded.provider_key,
  provider_name = excluded.provider_name,
  source = excluded.source,
  source_url = excluded.source_url,
  api_model_id = excluded.api_model_id,
  model_type = excluded.model_type,
  badge = excluded.badge,
  description = excluded.description,
  capabilities = excluded.capabilities,
  params_label = excluded.params_label,
  context_tokens = excluded.context_tokens,
  max_output_tokens = excluded.max_output_tokens,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  is_free = excluded.is_free,
  is_open_source = excluded.is_open_source,
  is_featured = excluded.is_featured,
  is_thinking = excluded.is_thinking,
  default_temperature = excluded.default_temperature,
  default_max_tokens = excluded.default_max_tokens,
  license = excluded.license,
  deployment = excluded.deployment,
  released_at = excluded.released_at,
  source_updated_at = excluded.source_updated_at,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  endpoint_path = excluded.endpoint_path;

-- Link DB-driven fallback routes for retired or preview-limited models.
update public.ai_models set fallback_model_slug = 'nemotron-3-5-super-vl-120b-a12b' where slug in ('gemma-4-31b-it', 'muse-glimmer-30b', 'paligemma');
update public.ai_models set fallback_model_slug = 'flux-1-schnell' where slug = 'cosmos3-nano';
