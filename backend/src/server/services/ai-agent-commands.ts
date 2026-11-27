import "server-only";
import { Errors } from "@backend/lib/http/api";
import { buildSystemPrompt, clampReply, type AgentCommand, type AgentConfig } from "@backend/server/ai/agent";
import {
  escapeTelegramHtml,
  formatTelegramHtmlChunks,
  formatTelegramPlainChunks,
  pickFeaturedLinkPreviewUrl,
} from "@backend/server/ai/citations";
import { imagePrompt, usageText } from "@backend/server/ai/commands";
import { analyzeImage, base64ToBytes, chat, generateImage, sniffImageMime } from "@backend/server/ai/provider";
import { buildWebSearchSystemContext, webSearchToCitations } from "@backend/server/ai/web-search-types";
import { logEvent } from "@backend/server/logger";
import { parseSearchProviderPrefix, searchOpenWeb } from "@backend/server/search/web-search";
import { enforceRateLimit } from "@backend/server/security/rate-limit";
import { runAgenticTools } from "@backend/server/services/agentic-runner";
import { getDbDefaultImageModel, getDbFastChatModel } from "@backend/server/services/ai-models";
import type { ExecutionTracer } from "@backend/server/services/execution-trace";
import {
  downloadFile,
  getTelegramRetryAfterSec,
  isTelegramBotDeletedError,
  isTelegramRateLimitError,
  sendChatAction,
  sendPhoto,
  sendPhotoGallery,
  type TelegramDocument,
  type TelegramPhotoSize,
} from "@backend/server/telegram/client";
import {
  dispatchTelegramFormattedMessages,
  dispatchTelegramMessage,
  recordTelegramCooldown,
  reserveTelegramSendSlot,
} from "@backend/server/telegram/outbound";

/** High-accuracy multimodal VLMs accept high-res images up to 2 MB so chart labels and fine text stay crisp. */
export const MAX_PHOTO_BYTES = 2_000_000;

/** Picks the largest photo size that still fits under the byte limit, or the smallest one when none does. */
export function pickPhoto(sizes: TelegramPhotoSize[], maxBytes = MAX_PHOTO_BYTES): TelegramPhotoSize | undefined {
  const sorted = [...sizes].sort((a, b) => (a.file_size ?? a.width * a.height) - (b.file_size ?? b.width * b.height));
  const fits = sorted.filter((s) => (s.file_size ?? 0) <= maxBytes);
  return fits.length ? fits[fits.length - 1] : sorted[0];
}

export interface MediaCommandArgs {
  config: AgentConfig;
  command: AgentCommand;
  /** Text after the command name. */
  input: string;
  botId: string;
  workspaceId: string;
  token: string;
  chatId: number;
  isGroup?: boolean;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  tracer?: ExecutionTracer;
}

/** Runs an image, describe, or open-source web search command and delivers rich formatted Telegram output. */
export async function runMediaCommand(a: MediaCommandArgs): Promise<void> {
  const sendText = async (nodeId: string, text: string) => {
    const clamped = clampReply(text);
    const run = () =>
      dispatchTelegramMessage({
        botId: a.botId,
        workspaceId: a.workspaceId,
        token: a.token,
        chatId: String(a.chatId),
        kind: "text",
        text: clamped,
        isGroup: a.isGroup,
      });
    if (!a.tracer) {
      await run();
      return;
    }
    await a.tracer.trace(
      nodeId,
      "telegram.send_message",
      { chatId: String(a.chatId), format: "text", isGroup: Boolean(a.isGroup) },
      run,
      (res) => ({
        delivered: res.delivered,
        queued: res.queued,
        messageId: res.messageId,
        chunks: 1,
        replyPreview: clamped.slice(0, 600),
      }),
    );
  };

  if (a.command.kind === "image") {
    if (!a.input) return void (await sendText("usage_reply", usageText(a.command)));
    // Resolves the top active image generation model from Supabase `public.ai_models` if none was selected on the agent.
    const imageModel = a.config.imageModel ?? (await getDbDefaultImageModel());
    if (!imageModel) return void (await sendText("no_image_model", "No image generation model is active in the catalog right now."));
    await enforceRateLimit(`img:${a.botId}:${a.chatId}`, 8, 60_000);
    void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);

    const promptText = imagePrompt(a.command, a.input);
    // Keep Telegram's "sending a photo..." indicator alive (Telegram clears it after 5 s) while FLUX generates.
    const actionPulse = setInterval(() => {
      void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);
    }, 4_500);
    let img: Awaited<ReturnType<typeof generateImage>>;
    try {
      img = a.tracer
        ? await a.tracer.trace(
            "ai_image_generate",
            "ai.image_generate",
            { model: imageModel.apiModelId, modelSlug: imageModel.slug, source: imageModel.source, prompt: promptText },
            () => generateImage(imageModel, promptText, { maxBudgetMs: 42_000, attemptTimeoutMs: 12_000 }),
            (res) => {
              const sniffed = sniffImageMime(res.imageBase64);
              const byteLen = base64ToBytes(res.imageBase64).length;
              return {
                modelUsed: res.modelUsed ?? imageModel.apiModelId,
                modelSlug: res.modelSlug ?? imageModel.slug,
                source: res.source ?? imageModel.source,
                usedFallback: Boolean(res.usedFallback),
                revisedPrompt: res.revisedPrompt ?? undefined,
                dimensions: res.width && res.height ? `${res.width}x${res.height}` : undefined,
                mimeType: sniffed.mime,
                bytes: byteLen,
              };
            },
          )
        : await generateImage(imageModel, promptText, { maxBudgetMs: 42_000, attemptTimeoutMs: 12_000 });
    } finally {
      clearInterval(actionPulse);
    }

    const { mime, ext } = sniffImageMime(img.imageBase64);
    const bytes = base64ToBytes(img.imageBase64);
    const caption = a.input.slice(0, 200);
    const deliverPhoto = async (): Promise<{ messageId?: number }> => {
      const slot = await reserveTelegramSendSlot(a.botId, a.chatId, {
        isGroup: a.isGroup,
        maxImmediateWaitMs: 3_500,
      });
      if (slot.delayMs > 0 && slot.delayMs <= 5_000) {
        await new Promise((r) => setTimeout(r, slot.delayMs));
      }
      try {
        return await sendPhoto(a.token, a.chatId, bytes, caption, `image.${ext}`, mime);
      } catch (err) {
        if (isTelegramBotDeletedError(err)) throw err;
        if (isTelegramRateLimitError(err)) {
          const retrySec = getTelegramRetryAfterSec(err) ?? 5;
          await recordTelegramCooldown(a.botId, a.chatId, retrySec);
          if (retrySec <= 8) {
            await new Promise((r) => setTimeout(r, retrySec * 1000 + 250));
            return await sendPhoto(a.token, a.chatId, bytes, caption, `image.${ext}`, mime);
          }
          throw err;
        }
        // Retry once on transient network / Telegram upload hiccup.
        logEvent("backend", "warn", `Telegram sendPhoto failed once; retrying upload: ${err instanceof Error ? err.message : "unknown"}`, {
          botId: a.botId,
          bytes: bytes.length,
        });
        await new Promise((r) => setTimeout(r, 600));
        return await sendPhoto(a.token, a.chatId, bytes, caption, `image.${ext}`, mime);
      }
    };

    const delivered = a.tracer
      ? await a.tracer.trace(
          "telegram_send_photo",
          "telegram.send_photo",
          { chatId: String(a.chatId), mimeType: mime, bytes: bytes.length, caption },
          deliverPhoto,
          (res) => ({ delivered: true, messageId: res.messageId, mimeType: mime, bytes: bytes.length, caption }),
        )
      : await deliverPhoto();
    logEvent("backend", "info", `Delivered Telegram image via /${a.command.command}`, {
      botId: a.botId,
      model: img.modelSlug ?? imageModel.slug,
      bytes: bytes.length,
      mime,
      messageId: delivered.messageId,
    });
    return;
  }

  if (a.command.kind === "market" || a.command.kind === "brief") {
    const isMarketOverview = a.command.command === "market" || a.command.kind === "brief";
    if (!a.input && !isMarketOverview) return void (await sendText("usage_reply", usageText(a.command)));
    const model = a.config.model ?? (await getDbFastChatModel());
    if (!model) return void (await sendText("no_model_reply", "No AI model is configured for this agent yet."));
    await enforceRateLimit(`agentic:${a.botId}:${a.chatId}`, 15, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);

    const { provider, query: parsedQuery } = a.input ? parseSearchProviderPrefix(a.input) : { provider: "auto" as const, query: "" };
    const effectiveQuery =
      parsedQuery ||
      (a.command.kind === "brief"
        ? a.command.instruction.trim() || `Daily ${a.config.category} briefing today`
        : "NSE BSE NIFTY 50 SENSEX BANK NIFTY Indian stock market overview today");

    const agentic = await runAgenticTools({
      message: effectiveQuery,
      command: a.command,
      autoSearch: true,
      marketData: a.command.kind === "market" || Boolean(a.config.tools.marketData),
      agentCategory: a.config.category,
      searchProvider: provider,
      maxResults: 6,
      maxImages: 3,
      maxVideos: 3,
      tracer: a.tracer,
    });

    const extraGuide = a.command.instruction.trim() ? `\n\nCommand guidance: ${a.command.instruction.trim()}` : "";
    const system = [buildSystemPrompt(a.config, [], new Date(), []), agentic.systemContext, extraGuide].filter(Boolean).join("\n\n");

    const callModel = () =>
      chat(
        model,
        [
          { role: "system", content: system },
          { role: "user", content: effectiveQuery.slice(0, 1200) },
        ],
        {
          temperature: Math.min(a.config.temperature, 0.35),
          maxTokens: Math.min(Math.max(a.config.maxTokens, 1536), 3072),
          thinking: false,
          timeoutMs: 22_000,
          allowFallback: true,
        },
      );

    const r = a.tracer
      ? await a.tracer.trace(
          "ai_agentic_synthesis",
          "ai.chat",
          {
            model: model.apiModelId,
            modelSlug: model.slug,
            source: model.source,
            promptPreview: effectiveQuery.slice(0, 400),
            citations: agentic.citations.length,
            marketQuotes: agentic.marketSnapshot?.quotes.length ?? 0,
          },
          callModel,
          (res) => ({
            modelUsed: res.modelUsed ?? model.apiModelId,
            modelSlug: res.modelSlug ?? model.slug,
            source: res.source ?? model.source,
            usedFallback: Boolean(res.usedFallback),
            promptTokens: res.usage.promptTokens,
            completionTokens: res.usage.completionTokens,
            totalTokens: res.usage.totalTokens,
            costUsd: res.usage.costUsd ?? 0,
            outputPreview: res.text.slice(0, 800),
          }),
        )
      : await callModel();

    const videos = agentic.webMedia?.videos ?? [];
    const mediaLinks = { videos };
    const htmlChunks = formatTelegramHtmlChunks(r.text, agentic.citations, mediaLinks);
    const plainChunks = formatTelegramPlainChunks(r.text, agentic.citations, mediaLinks);
    const previewUrl = pickFeaturedLinkPreviewUrl(r.text, agentic.citations, mediaLinks);

    const dispatchFormatted = () =>
      dispatchTelegramFormattedMessages({
        botId: a.botId,
        workspaceId: a.workspaceId,
        token: a.token,
        chatId: a.chatId,
        htmlChunks,
        plainChunks,
        linkPreviewUrl: previewUrl,
        preferLargeMedia: videos.length > 0,
        isGroup: a.isGroup,
      });

    if (a.tracer) {
      await a.tracer.trace(
        "telegram_send_agentic",
        "telegram.send_message",
        { chatId: String(a.chatId), chunks: htmlChunks.length, linkPreviewUrl: previewUrl ?? undefined },
        dispatchFormatted,
        (res) => ({
          deliveredCount: res.deliveredCount,
          queuedCount: res.queuedCount,
          messageIds: res.messageIds,
          chunks: htmlChunks.length,
          replyPreview: r.text.slice(0, 600),
        }),
      );
    } else {
      await dispatchFormatted();
    }
    return;
  }

  if (a.command.kind === "search") {
    if (!a.input) return void (await sendText("usage_reply", usageText(a.command)));
    const model = a.config.model ?? (await getDbFastChatModel());
    if (!model) return void (await sendText("no_model_reply", "No AI model is configured for this agent yet."));
    await enforceRateLimit(`search:${a.botId}:${a.chatId}`, 12, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);

    const { provider, query } = parseSearchProviderPrefix(a.input);
    if (!query) return void (await sendText("usage_reply", usageText(a.command)));

    const bundle = a.tracer
      ? await a.tracer.trace(
          "web_search",
          "web.search",
          { query, provider: provider ?? "auto" },
          () => searchOpenWeb(query, { provider, maxResults: 6, maxImages: 3, maxVideos: 4 }),
          (res) => ({
            engine: res.engine,
            providerSlug: res.providerSlug,
            resultCount: res.results.length,
            imageCount: res.images.length,
            videoCount: res.videos.length,
            topSources: res.results.slice(0, 4).map((r) => `${r.title} (${r.url})`),
          }),
        )
      : await searchOpenWeb(query, { provider, maxResults: 6, maxImages: 3, maxVideos: 4 });

    const citations = webSearchToCitations(bundle.results);
    const extraGuide = a.command.instruction.trim() ? `\n\nExtra search instructions: ${a.command.instruction.trim()}` : "";
    const system = `${buildSystemPrompt(a.config, [], new Date(), [])}\n\n${buildWebSearchSystemContext(bundle)}${extraGuide}`;

    const callModel = () =>
      chat(
        model,
        [
          { role: "system", content: system },
          { role: "user", content: query.slice(0, 1000) },
        ],
        {
          temperature: Math.min(a.config.temperature, 0.45),
          maxTokens: Math.min(Math.max(a.config.maxTokens, 1536), 3072),
          thinking: false,
          timeoutMs: 20_000,
          allowFallback: true,
        },
      );

    const r = a.tracer
      ? await a.tracer.trace(
          "ai_search_synthesis",
          "ai.chat",
          { model: model.apiModelId, modelSlug: model.slug, source: model.source, promptPreview: query.slice(0, 400), citations: citations.length },
          callModel,
          (res) => ({
            modelUsed: res.modelUsed ?? model.apiModelId,
            modelSlug: res.modelSlug ?? model.slug,
            source: res.source ?? model.source,
            usedFallback: Boolean(res.usedFallback),
            promptTokens: res.usage.promptTokens,
            completionTokens: res.usage.completionTokens,
            totalTokens: res.usage.totalTokens,
            costUsd: res.usage.costUsd ?? 0,
            outputPreview: res.text.slice(0, 800),
          }),
        )
      : await callModel();

    const mediaLinks = { videos: bundle.videos };
    const htmlChunks = formatTelegramHtmlChunks(r.text, citations, mediaLinks);
    const plainChunks = formatTelegramPlainChunks(r.text, citations, mediaLinks);
    const previewUrl = pickFeaturedLinkPreviewUrl(r.text, citations, mediaLinks);

    const dispatchFormatted = () =>
      dispatchTelegramFormattedMessages({
        botId: a.botId,
        workspaceId: a.workspaceId,
        token: a.token,
        chatId: a.chatId,
        htmlChunks,
        plainChunks,
        linkPreviewUrl: previewUrl,
        preferLargeMedia: bundle.videos.length > 0,
        isGroup: a.isGroup,
      });

    if (a.tracer) {
      await a.tracer.trace(
        "telegram_send_search",
        "telegram.send_message",
        { chatId: String(a.chatId), chunks: htmlChunks.length, linkPreviewUrl: previewUrl ?? undefined },
        dispatchFormatted,
        (res) => ({
          deliveredCount: res.deliveredCount,
          queuedCount: res.queuedCount,
          messageIds: res.messageIds,
          chunks: htmlChunks.length,
          replyPreview: r.text.slice(0, 600),
        }),
      );
    } else {
      await dispatchFormatted();
    }

    // Follow up with crisp image previews from Wikimedia Commons / Openverse / Wikipedia when available.
    if (bundle.images.length > 0) {
      void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);
      const photos = bundle.images.slice(0, 3).map((im, idx) => ({
        url: im.thumbnailUrl || im.imageUrl,
        caption:
          idx === 0
            ? `<b>🖼 ${escapeTelegramHtml(im.title)}</b>\n<i>Source: ${escapeTelegramHtml(im.source)}</i> · <a href="${im.sourceUrl.replace(/"/g, "&quot;")}">Open image</a>`
            : `<b>${escapeTelegramHtml(im.title)}</b> <i>(${escapeTelegramHtml(im.source)})</i>`,
      }));
      if (a.tracer) {
        await a.tracer
          .trace(
            "telegram_send_gallery",
            "telegram.send_gallery",
            { chatId: String(a.chatId), photoCount: photos.length },
            () => sendPhotoGallery(a.token, a.chatId, photos),
            (res) => ({ sentCount: res.sentCount }),
          )
          .catch(() => undefined);
      } else {
        await sendPhotoGallery(a.token, a.chatId, photos).catch(() => undefined);
      }
    }
    return;
  }

  if (a.command.kind === "describe") {
    const isImageDoc = Boolean(a.document?.mime_type?.startsWith("image/"));
    const picked = a.photo?.length ? pickPhoto(a.photo) : undefined;
    const fileId = picked?.file_id ?? (isImageDoc ? a.document!.file_id : undefined);
    if (!fileId) return void (await sendText("usage_reply", usageText(a.command)));

    await enforceRateLimit(`vision:${a.botId}:${a.chatId}`, 15, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);

    const mime = isImageDoc && a.document?.mime_type ? a.document.mime_type : "image/jpeg";
    const bytes = a.tracer
      ? await a.tracer.trace(
          "telegram_download_photo",
          "telegram.download_file",
          {
            fileId: `${fileId.slice(0, 14)}...`,
            mimeType: mime,
            dimensions: picked ? `${picked.width}x${picked.height}` : undefined,
          },
          () => downloadFile(a.token, fileId, MAX_PHOTO_BYTES * 2),
          (buf) => ({ mimeType: mime, bytes: buf.length }),
        )
      : await downloadFile(a.token, fileId, MAX_PHOTO_BYTES * 2);

    if (bytes.length > MAX_PHOTO_BYTES * 1.8) throw Errors.invalid("That photo is too large to analyze. Please send a smaller image (under 3 MB).");

    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const baseTask = a.command.instruction.trim() || "Describe and analyze this image accurately in detail, reading any visible text, numbers, labels, and charts.";
    const userFocus = a.input.trim();
    const prompt = userFocus
      ? `${baseTask}\n\nUser's specific request: ${userFocus}`
      : baseTask;

    const system = [
      `You are ${a.config.name}, an accurate, thorough multimodal AI assistant on Telegram.`,
      `Primary language: ${a.config.language}.${a.config.tools.matchLanguage ? " Match the user's language if they wrote in another language." : ""}`,
      "Examine the image carefully. Read exact visible text, numbers, ticker symbols, dates, metrics, and chart movements accurately.",
      "Give a detailed, well-structured answer using bold headings, bullet points, and Markdown tables for structured metrics or comparisons. Never answer 'unanswerable' or give vague one-line captions.",
      a.config.instructions.trim() ? `Additional agent instructions: ${a.config.instructions.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const callVision = () =>
      analyzeImage(prompt.slice(0, 1500), dataUrl, {
        system,
        maxTokens: Math.min(Math.max(a.config.maxTokens, 1536), 2048),
        temperature: 0.25,
        timeoutMs: 20_000,
      });

    const r = a.tracer
      ? await a.tracer.trace(
          "ai_vision_analyze",
          "ai.vision",
          { promptPreview: (userFocus || baseTask).slice(0, 400), mimeType: mime, imageBytes: bytes.length },
          callVision,
          (res) => ({
            modelUsed: res.modelUsed ?? "vision-model",
            modelSlug: res.modelSlug ?? undefined,
            source: res.source ?? "nvidia",
            usedFallback: Boolean(res.usedFallback),
            promptTokens: res.usage.promptTokens,
            completionTokens: res.usage.completionTokens,
            totalTokens: res.usage.totalTokens,
            costUsd: res.usage.costUsd ?? 0,
            outputPreview: res.text.slice(0, 800),
          }),
        )
      : await callVision();

    const htmlChunks = formatTelegramHtmlChunks(r.text, []);
    const plainChunks = formatTelegramPlainChunks(r.text, []);
    const sendVisionReply = () =>
      dispatchTelegramFormattedMessages({
        botId: a.botId,
        workspaceId: a.workspaceId,
        token: a.token,
        chatId: a.chatId,
        htmlChunks,
        plainChunks,
        isGroup: a.isGroup,
      });

    if (a.tracer) {
      await a.tracer.trace(
        "telegram_send_vision",
        "telegram.send_message",
        { chatId: String(a.chatId), chunks: htmlChunks.length, format: "html" },
        sendVisionReply,
        (res) => ({
          deliveredCount: res.deliveredCount,
          queuedCount: res.queuedCount,
          messageIds: res.messageIds,
          chunks: htmlChunks.length,
          replyPreview: r.text.slice(0, 600),
        }),
      );
    } else {
      await sendVisionReply();
    }
  }
}
