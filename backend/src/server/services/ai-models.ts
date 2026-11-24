import "server-only";
import { Errors } from "@backend/lib/http/api";
import type { AuthContext } from "@backend/server/auth/context";
import { MODEL_CATALOG, type ModelDto } from "@backend/server/ai/model-catalog";

type Row = Record<string, unknown>;

const COLUMNS =
  "id, slug, name, provider_key, provider_name, source, source_url, api_model_id, model_type, badge, description, capabilities, params_label, context_tokens, max_output_tokens, input_modalities, output_modalities, is_free, is_open_source, is_featured, is_thinking, default_temperature, default_max_tokens, license, deployment, released_at, source_updated_at, sort_order";

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

/** Catalog used when Supabase is not configured (demo mode). Ids mirror slugs; nothing is persisted. */
export function demoModels(): ModelDto[] {
  return MODEL_CATALOG.map((m) => ({ ...m, id: m.slug, favorite: false }));
}

/** All catalog models with the caller's favourites, read through RLS as the signed-in user. */
export async function listModels(ctx: AuthContext): Promise<ModelDto[]> {
  const [models, favs] = await Promise.all([
    ctx.supabase.from("ai_models").select(COLUMNS).order("sort_order").order("name"),
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
