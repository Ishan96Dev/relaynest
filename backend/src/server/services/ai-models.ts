import "server-only";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { Errors } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import type { AuthContext } from "@backend/server/auth/context";
import {
  MODEL_CATALOG,
  PROVIDER_CATALOG,
  type ModelDto,
  type ModelSource,
  type ModelType,
  type ProviderRecord,
} from "@backend/server/ai/model-catalog";

type Row = Record<string, unknown>;

const COLUMNS =
  "id, slug, name, provider_key, provider_name, source, source_url, api_model_id, model_type, badge, description, capabilities, params_label, context_tokens, max_output_tokens, input_modalities, output_modalities, is_free, is_open_source, is_featured, is_active, fallback_model_slug, endpoint_path, is_thinking, default_temperature, default_max_tokens, license, deployment, released_at, source_updated_at, sort_order";

const PROVIDER_COLUMNS =
  "source, display_name, chat_base_url, media_base_url, env_key_name, supports_thinking_toggle, is_active";

/** Minimal runtime fields needed to execute any model from Supabase `ai_models`. */
export interface DbRunnableModel {
  slug: string;
  source: ModelSource;
  apiModelId: string;
  isThinking?: boolean;
  isActive?: boolean;
  fallbackModelSlug?: string | null;
  endpointPath?: string | null;
  maxOutputTokens?: number | null;
  defaultMaxTokens?: number;
}

export function toModelDto(r: Row, favorite: boolean): ModelDto {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    providerKey: r.provider_key as string,
    providerName: r.provider_name as string,
    source: r.source as ModelDto["source"],
    sourceUrl: r.source_url as string,
    apiModelId: r.api_model_id as string,
    modelType: r.model_type as ModelDto["modelType"],
    badge: (r.badge as string | null) ?? null,
    description: r.description as string,
    capabilities: (r.capabilities as string[]) ?? [],
    paramsLabel: (r.params_label as string | null) ?? null,
    contextTokens: n(r.context_tokens),
    maxOutputTokens: n(r.max_output_tokens),
    inputModalities: (r.input_modalities as string[]) ?? [],
    outputModalities: (r.output_modalities as string[]) ?? [],
    isFree: Boolean(r.is_free),
    isOpenSource: Boolean(r.is_open_source),
    isFeatured: Boolean(r.is_featured),
    isActive: r.is_active === undefined ? true : Boolean(r.is_active),
    fallbackModelSlug: (r.fallback_model_slug as string | null) ?? null,
    endpointPath: (r.endpoint_path as string | null) ?? null,
    isThinking: Boolean(r.is_thinking),
    defaultTemperature: Number(r.default_temperature ?? 0.5),
    defaultMaxTokens: Number(r.default_max_tokens ?? 1024),
    license: (r.license as string | null) ?? null,
    deployment: (r.deployment as string[]) ?? [],
    releasedAt: (r.released_at as string | null) ?? null,
    sourceUpdatedAt: (r.source_updated_at as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 1000),
    favorite,
  };
}

function toProviderRecord(r: Row): ProviderRecord {
  return {
    source: r.source as ModelSource,
    displayName: r.display_name as string,
    chatBaseUrl: (r.chat_base_url as string).replace(/\/+$/, ""),
    mediaBaseUrl: r.media_base_url ? (r.media_base_url as string).replace(/\/+$/, "") : null,
    envKeyName: r.env_key_name as string,
    supportsThinkingToggle: Boolean(r.supports_thinking_toggle),
    isActive: r.is_active === undefined ? true : Boolean(r.is_active),
  };
}

function toRunnable(m: ModelDto): DbRunnableModel {
  return {
    slug: m.slug,
    source: m.source,
    apiModelId: m.apiModelId,
    isThinking: m.isThinking,
    isActive: m.isActive,
    fallbackModelSlug: m.fallbackModelSlug,
    endpointPath: m.endpointPath,
    maxOutputTokens: m.maxOutputTokens,
    defaultMaxTokens: m.defaultMaxTokens,
  };
}

// ---------- 60 s in-memory cache over Supabase public.ai_providers & public.ai_models ----------
const CACHE_TTL_MS = 60_000;
let modelsCache: { at: number; rows: ModelDto[] } | null = null;
let providersCache: { at: number; map: Map<ModelSource, ProviderRecord> } | null = null;

export function clearModelRegistryCache() {
  modelsCache = null;
  providersCache = null;
}

/** Loads all provider rows from Supabase `public.ai_providers` (falls back to static demo catalog only when Supabase isn't configured). */
export async function loadProvidersFromDb(): Promise<Map<ModelSource, ProviderRecord>> {
  if (providersCache && Date.now() - providersCache.at < CACHE_TTL_MS) return providersCache.map;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient().from("ai_providers").select(PROVIDER_COLUMNS);
      if (!error && data?.length) {
        const map = new Map<ModelSource, ProviderRecord>();
        for (const r of data) map.set(r.source as ModelSource, toProviderRecord(r as Row));
        providersCache = { at: Date.now(), map };
        return map;
      }
    } catch {
      // fall through to demo fallback
    }
  }
  const fallback = new Map<ModelSource, ProviderRecord>(PROVIDER_CATALOG.map((p) => [p.source, p]));
  providersCache = { at: Date.now(), map: fallback };
  return fallback;
}

/** Returns the authoritative provider endpoint & auth key configuration from Supabase `public.ai_providers`. */
export async function getProviderConfig(source: ModelSource): Promise<ProviderRecord> {
  const map = await loadProvidersFromDb();
  const found = map.get(source);
  if (!found) throw Errors.invalid(`Unknown AI provider "${source}".`);
  return found;
}

/** Loads all model rows from Supabase `public.ai_models`, ordered by `sort_order, name`. */
export async function loadCatalogFromDb(): Promise<ModelDto[]> {
  if (modelsCache && Date.now() - modelsCache.at < CACHE_TTL_MS) return modelsCache.rows;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient().from("ai_models").select(COLUMNS).order("sort_order").order("name");
      if (!error && data?.length) {
        const rows = data.map((r) => toModelDto(r as Row, false));
        modelsCache = { at: Date.now(), rows };
        return rows;
      }
    } catch {
      // fall through to demo fallback
    }
  }
  const fallback = demoModelsAll();
  modelsCache = { at: Date.now(), rows: fallback };
  return fallback;
}

/**
 * Resolves a runnable model against Supabase `public.ai_models`.
 * If the row is marked inactive (`is_active = false`) and has a `fallback_model_slug` in Supabase,
 * transparently routes to the active fallback model row in DB.
 */
export async function resolveModelFromDb(model: DbRunnableModel): Promise<{ model: DbRunnableModel; provider: ProviderRecord }> {
  const catalog = await loadCatalogFromDb();
  let row = catalog.find((m) => m.slug === model.slug) ?? catalog.find((m) => m.apiModelId === model.apiModelId);

  // Follow DB-defined fallback_model_slug if the selected model is inactive (retired/EOL).
  const visited = new Set<string>();
  while (row && row.isActive === false && row.fallbackModelSlug && !visited.has(row.slug)) {
    visited.add(row.slug);
    const next = catalog.find((m) => m.slug === row!.fallbackModelSlug);
    if (!next) break;
    row = next;
  }

  const effective: DbRunnableModel = row
    ? toRunnable(row)
    : { ...model, endpointPath: model.endpointPath ?? "/chat/completions" };
  const provider = await getProviderConfig(effective.source);
  return { model: effective, provider };
}

/** Looks up a model's DB-configured fallback model row (`fallback_model_slug`), if any. */
export async function getDbConfiguredFallback(slug: string): Promise<DbRunnableModel | null> {
  const catalog = await loadCatalogFromDb();
  const row = catalog.find((m) => m.slug === slug);
  if (!row?.fallbackModelSlug) return null;
  const target = catalog.find((m) => m.slug === row.fallbackModelSlug && m.isActive !== false);
  return target ? toRunnable(target) : null;
}

/** Returns ordered active fallback models from Supabase `public.ai_models` by `sort_order`. */
export async function getDbFallbackModels(opts: {
  source?: ModelSource;
  requireImage?: boolean;
  modelTypes?: ModelType[];
  excludeSlugs?: string[];
  limit?: number;
}): Promise<DbRunnableModel[]> {
  const catalog = await loadCatalogFromDb();
  const excluded = new Set(opts.excludeSlugs ?? []);
  const types = new Set<ModelType>(opts.modelTypes ?? ["chat", "multimodal"]);
  const hits = catalog.filter((m) => {
    if (m.isActive === false) return false;
    if (excluded.has(m.slug)) return false;
    if (m.slug === "paligemma") return false;
    if (!types.has(m.modelType)) return false;
    if (opts.source && m.source !== opts.source) return false;
    if (opts.requireImage && !m.inputModalities.includes("Image")) return false;
    return true;
  });
  return hits.slice(0, opts.limit ?? 3).map(toRunnable);
}

/** Ordered active multimodal vision models from Supabase `public.ai_models` (excluding legacy caption-only PaliGemma). */
export async function getDbVisionModels(): Promise<DbRunnableModel[]> {
  return getDbFallbackModels({ modelTypes: ["multimodal"], requireImage: true, limit: 3 });
}

/** Ordered active image generation models from Supabase `public.ai_models` by `sort_order`. */
export async function getDbImageModels(excludeSlugs: string[] = []): Promise<DbRunnableModel[]> {
  return getDbFallbackModels({
    modelTypes: ["image_generation"],
    excludeSlugs,
    limit: 5,
  });
}

/** Highest-priority active image generation model from Supabase `public.ai_models`. */
export async function getDbDefaultImageModel(excludeSlug?: string): Promise<DbRunnableModel | null> {
  const list = await getDbImageModels(excludeSlug ? [excludeSlug] : []);
  return list[0] ?? null;
}

/** Highest-priority active embedding model from Supabase `public.ai_models`. */
export async function getDbEmbeddingModel(): Promise<DbRunnableModel> {
  const list = await getDbFallbackModels({ modelTypes: ["embedding"], limit: 1 });
  if (!list[0]) throw new Error("No active embedding model is configured in public.ai_models.");
  return list[0];
}

/** Highest-priority active chat model from Supabase `public.ai_models` (used for fast KB answering on rule-based bots). */
export async function getDbFastChatModel(): Promise<DbRunnableModel | null> {
  const list = await getDbFallbackModels({ modelTypes: ["chat"], limit: 1 });
  if (list[0]) return list[0];
  const any = await getDbFallbackModels({ modelTypes: ["chat", "multimodal"], limit: 1 });
  return any[0] ?? null;
}

function demoModelsAll(): ModelDto[] {
  return MODEL_CATALOG.map((m) => ({ ...m, id: m.slug, favorite: false }));
}

/** Active catalog used when Supabase is not configured (demo mode). Ids mirror slugs; nothing is persisted. */
export function demoModels(): ModelDto[] {
  return demoModelsAll().filter((m) => m.isActive !== false);
}

/** All active catalog models with the caller's favourites, read through RLS as the signed-in user from Supabase `public.ai_models`. */
export async function listModels(ctx: AuthContext): Promise<ModelDto[]> {
  const [models, favs] = await Promise.all([
    ctx.supabase.from("ai_models").select(COLUMNS).eq("is_active", true).order("sort_order").order("name"),
    ctx.supabase.from("ai_model_favorites").select("model_id").eq("user_id", ctx.userId),
  ]);
  if (models.error) throw new Error("Failed to load the model catalog");
  const favorite = new Set((favs.data ?? []).map((f) => f.model_id as string));
  return (models.data ?? []).map((r) => toModelDto(r, favorite.has(r.id as string)));
}

export async function getModelBySlug(ctx: AuthContext, slug: string): Promise<ModelDto> {
  const { data, error } = await ctx.supabase.from("ai_models").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error("Failed to load the model");
  if (!data) throw Errors.notFound("Model");
  const fav = await ctx.supabase.from("ai_model_favorites").select("model_id").eq("user_id", ctx.userId).eq("model_id", data.id).maybeSingle();
  return toModelDto(data, Boolean(fav.data));
}

export async function setFavorite(ctx: AuthContext, slug: string, on: boolean): Promise<{ slug: string; favorite: boolean }> {
  const model = await getModelBySlug(ctx, slug);
  const { error } = on
    ? await ctx.supabase.from("ai_model_favorites").upsert({ user_id: ctx.userId, model_id: model.id }, { onConflict: "user_id,model_id", ignoreDuplicates: true })
    : await ctx.supabase.from("ai_model_favorites").delete().eq("user_id", ctx.userId).eq("model_id", model.id);
  if (error) throw new Error("Failed to update favorite");
  return { slug, favorite: on };
}
