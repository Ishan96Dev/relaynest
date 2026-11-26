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
import { parseSearchProviderPrefix, searchOpenWeb } from "@backend/server/search/web-search";
import { enforceRateLimit } from "@backend/server/security/rate-limit";
import { getDbDefaultImageModel, getDbFastChatModel } from "@backend/server/services/ai-models";
import {
  downloadFile,
  sendChatAction,
  sendPhoto,
  sendPhotoGallery,
  type TelegramDocument,
  type TelegramPhotoSize,
} from "@backend/server/telegram/client";
import { dispatchTelegramFormattedMessages, dispatchTelegramMessage } from "@backend/server/telegram/outbound";

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
}

/** Runs an image, describe, or open-source web search command and delivers rich formatted Telegram output. */
export async function runMediaCommand(a: MediaCommandArgs): Promise<void> {
  const say = (text: string) =>
    dispatchTelegramMessage({
      botId: a.botId,
      workspaceId: a.workspaceId,
      token: a.token,
      chatId: String(a.chatId),
      kind: "text",
      text: clampReply(text),
      isGroup: a.isGroup,
    });

  if (a.command.kind === "image") {
    if (!a.input) return void (await say(usageText(a.command)));
    // Resolves the top active image generation model from Supabase `public.ai_models` if none was selected on the agent.
    const imageModel = a.config.imageModel ?? (await getDbDefaultImageModel());
    if (!imageModel) return void (await say("No image generation model is active in the catalog right now."));
    await enforceRateLimit(`img:${a.botId}:${a.chatId}`, 8, 60_000);
    void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);
    const img = await generateImage(imageModel, imagePrompt(a.command, a.input));
    const { mime, ext } = sniffImageMime(img.imageBase64);
    const bytes = base64ToBytes(img.imageBase64);
    await sendPhoto(a.token, a.chatId, bytes, a.input.slice(0, 200), `image.${ext}`, mime);
    return;
  }

  if (a.command.kind === "search") {
    if (!a.input) return void (await say(usageText(a.command)));
    const model = a.config.model ?? (await getDbFastChatModel());
    if (!model) return void (await say("No AI model is configured for this agent yet."));
    await enforceRateLimit(`search:${a.botId}:${a.chatId}`, 12, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);

    const { provider, query } = parseSearchProviderPrefix(a.input);
    if (!query) return void (await say(usageText(a.command)));
    const bundle = await searchOpenWeb(query, { provider, maxResults: 6, maxImages: 3, maxVideos: 4 });
    const citations = webSearchToCitations(bundle.results);
    const extraGuide = a.command.instruction.trim() ? `\n\nExtra search instructions: ${a.command.instruction.trim()}` : "";
    const system = `${buildSystemPrompt(a.config, [], new Date(), [])}\n\n${buildWebSearchSystemContext(bundle)}${extraGuide}`;

    const r = await chat(
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

    const mediaLinks = { videos: bundle.videos };
    const htmlChunks = formatTelegramHtmlChunks(r.text, citations, mediaLinks);
    const plainChunks = formatTelegramPlainChunks(r.text, citations, mediaLinks);
    const previewUrl = pickFeaturedLinkPreviewUrl(r.text, citations, mediaLinks);

    await dispatchTelegramFormattedMessages({
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
      await sendPhotoGallery(a.token, a.chatId, photos).catch(() => undefined);
    }
    return;
  }

  if (a.command.kind === "describe") {
    const isImageDoc = Boolean(a.document?.mime_type?.startsWith("image/"));
    const fileId = a.photo?.length ? pickPhoto(a.photo)?.file_id : isImageDoc ? a.document!.file_id : undefined;
    if (!fileId) return void (await say(usageText(a.command)));

    await enforceRateLimit(`vision:${a.botId}:${a.chatId}`, 15, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);

    const bytes = await downloadFile(a.token, fileId, MAX_PHOTO_BYTES * 2);
    if (bytes.length > MAX_PHOTO_BYTES * 1.8) throw Errors.invalid("That photo is too large to analyze. Please send a smaller image (under 3 MB).");

    const mime = isImageDoc && a.document?.mime_type ? a.document.mime_type : "image/jpeg";
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

    const r = await analyzeImage(prompt.slice(0, 1500), dataUrl, {
      system,
      maxTokens: Math.min(Math.max(a.config.maxTokens, 1536), 2048),
      temperature: 0.25,
      timeoutMs: 20_000,
    });
    const htmlChunks = formatTelegramHtmlChunks(r.text, []);
    const plainChunks = formatTelegramPlainChunks(r.text, []);
    await dispatchTelegramFormattedMessages({
      botId: a.botId,
      workspaceId: a.workspaceId,
      token: a.token,
      chatId: a.chatId,
      htmlChunks,
      plainChunks,
      isGroup: a.isGroup,
    });
  }
}
