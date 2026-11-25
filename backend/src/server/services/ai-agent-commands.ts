import "server-only";
import { Errors } from "@backend/lib/http/api";
import { clampReply, type AgentCommand, type AgentConfig } from "@backend/server/ai/agent";
import { formatTelegramHtmlReply, formatTelegramPlainReply } from "@backend/server/ai/citations";
import { imagePrompt, usageText } from "@backend/server/ai/commands";
import { analyzeImage, base64ToBytes, generateImage, rateLimit, sniffImageMime } from "@backend/server/ai/provider";
import { getDbDefaultImageModel } from "@backend/server/services/ai-models";
import {
  downloadFile,
  sendChatAction,
  sendFormattedMessage,
  sendMessage,
  sendPhoto,
  type TelegramDocument,
  type TelegramPhotoSize,
} from "@backend/server/telegram/client";

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
  token: string;
  chatId: number;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

/** Runs an image or describe command and sends the result to the chat. Usage hints are sent as plain messages. */
export async function runMediaCommand(a: MediaCommandArgs): Promise<void> {
  const say = (text: string) => sendMessage(a.token, a.chatId, clampReply(text));

  if (a.command.kind === "image") {
    if (!a.input) return void (await say(usageText(a.command)));
    // Resolves the top active image generation model from Supabase `public.ai_models` if none was selected on the agent.
    const imageModel = a.config.imageModel ?? (await getDbDefaultImageModel());
    if (!imageModel) return void (await say("No image generation model is active in the catalog right now."));
    rateLimit(`img:${a.botId}:${a.chatId}`, 8, 60_000);
    void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);
    const img = await generateImage(imageModel, imagePrompt(a.command, a.input));
    const { mime, ext } = sniffImageMime(img.imageBase64);
    const bytes = base64ToBytes(img.imageBase64);
    await sendPhoto(a.token, a.chatId, bytes, a.input.slice(0, 200), `image.${ext}`, mime);
    return;
  }

  if (a.command.kind === "describe") {
    const isImageDoc = Boolean(a.document?.mime_type?.startsWith("image/"));
    const fileId = a.photo?.length ? pickPhoto(a.photo)?.file_id : isImageDoc ? a.document!.file_id : undefined;
    if (!fileId) return void (await say(usageText(a.command)));

    rateLimit(`vision:${a.botId}:${a.chatId}`, 15, 60_000);
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
      `You are ${a.config.name}, an accurate multimodal AI assistant on Telegram.`,
      `Primary language: ${a.config.language}.${a.config.tools.matchLanguage ? " Match the user's language if they wrote in another language." : ""}`,
      "Examine the image carefully. Read exact visible text, numbers, ticker symbols, dates, metrics, and chart movements accurately.",
      "Give a clear, thorough, well-structured answer (bullet points where helpful, under 3,500 characters). Never answer 'unanswerable' or give vague one-line captions.",
      a.config.instructions.trim() ? `Additional agent instructions: ${a.config.instructions.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const r = await analyzeImage(prompt.slice(0, 1500), dataUrl, {
      system,
      maxTokens: Math.min(Math.max(a.config.maxTokens, 768), 1536),
      temperature: 0.25,
      timeoutMs: 20_000,
    });
    await sendFormattedMessage(a.token, a.chatId, formatTelegramHtmlReply(r.text, []), formatTelegramPlainReply(r.text, []));
  }
}
