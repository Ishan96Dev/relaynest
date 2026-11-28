-- Upgrade image generation catalog to live NVIDIA Build FLUX 3 Image Klein & FLUX.2 Klein 4B endpoints,
-- mark stalled/retired FLUX.1 Schnell & Cosmos3 Nano as legacy with automatic fallback routing,
-- and migrate existing AI agents referencing legacy image models to FLUX 3 Image Klein.

insert into public.ai_models (
  slug, name, provider_key, provider_name, source, source_url, api_model_id, model_type, badge, description,
  capabilities, params_label, context_tokens, max_output_tokens, input_modalities, output_modalities,
  is_free, is_open_source, is_featured, is_thinking, default_temperature, default_max_tokens,
  license, deployment, released_at, source_updated_at, sort_order, is_active, endpoint_path
) values
  (
    'flux-3-image-klein', 'FLUX 3 Image Klein', 'blackforest', 'Black Forest Labs', 'nvidia',
    'https://build.nvidia.com/black-forest-labs/flux-3-image-klein', 'black-forest-labs/flux-3-image-klein',
    'image_generation', 'Fastest Image',
    'Ultra-fast distilled FLUX 3 image model that turns text prompts into crisp 1024x1024, portrait, or widescreen images in 4 steps.',
    array['Image Generation', 'Text to Image']::text[], '4B', null, null,
    array['Text']::text[], array['Image']::text[],
    true, false, true, false, 0, 256,
    'NVIDIA API Trial Terms of Service', array['NVIDIA NIM']::text[],
    date '2026-10-15', date '2026-11-20', 92, true, '/genai/black-forest-labs/flux-3-image-klein'
  ),
  (
    'flux-2-klein-4b', 'FLUX.2 Klein 4B', 'blackforest', 'Black Forest Labs', 'nvidia',
    'https://build.nvidia.com/black-forest-labs/flux_2-klein-4b', 'black-forest-labs/flux.2-klein-4b',
    'image_generation', 'Image Generation',
    'Distilled 4B FLUX.2 image generation model delivering rich textures, sharp lighting, and faithful prompt adherence in seconds.',
    array['Image Generation', 'Text to Image']::text[], '4B', null, null,
    array['Text']::text[], array['Image']::text[],
    true, true, true, false, 0, 256,
    'NVIDIA API Trial Terms of Service; model weights Apache 2.0', array['NVIDIA NIM', 'Hugging Face']::text[],
    date '2026-05-12', date '2026-11-20', 94, true, '/genai/black-forest-labs/flux.2-klein-4b'
  )
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

-- Wire mutual high-availability fallbacks between active FLUX models.
update public.ai_models
set fallback_model_slug = 'flux-2-klein-4b'
where slug = 'flux-3-image-klein';

update public.ai_models
set fallback_model_slug = 'flux-3-image-klein'
where slug = 'flux-2-klein-4b';

-- Mark legacy stalled/retired image endpoints inactive and route them through FLUX 3 Image Klein.
update public.ai_models
set
  is_active = false,
  is_featured = false,
  badge = 'Legacy',
  sort_order = case when slug = 'flux-1-schnell' then 170 else 175 end,
  fallback_model_slug = 'flux-3-image-klein',
  description = case
    when slug = 'flux-1-schnell' then 'Legacy 12B FLUX.1 image generation model (automatically routes through FLUX 3 Image Klein on NVIDIA Build).'
    else 'World foundation model for image generation (automatically routes through FLUX 3 Image Klein when Cosmos3 preview is unavailable).'
  end
where slug in ('flux-1-schnell', 'cosmos3-nano');

-- Point existing AI agents assigned to legacy image models directly to FLUX 3 Image Klein.
update public.ai_agents
set image_model_id = (select id from public.ai_models where slug = 'flux-3-image-klein' limit 1)
where image_model_id in (
  select id from public.ai_models where slug in ('flux-1-schnell', 'cosmos3-nano')
);
