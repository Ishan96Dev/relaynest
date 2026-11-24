import "server-only";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { Errors } from "@backend/lib/http/api";
import { clampReply, type AgentCommand, type AgentConfig } from "@backend/server/ai/agent";
import { imagePrompt, usageText } from "@backend/server/ai/commands";
import { generateImage, rateLimit, vlmText, type RunnableModel } from "@backend/server/ai/provider";
import { downloadFile, sendChatAction, sendMessage, sendPhoto, type TelegramPhotoSize } from "@backend/server/telegram/client";

/** PaliGemma takes small inline images only (about 180 KB as base64), so Telegram's biggest size is usually too large. */
const MAX_PHOTO_BYTES = 120_000;
const VISION_SLUG = "paligemma";

/** Picks the largest photo size that still fits, or the smallest one when none does. */
export function pickPhoto(sizes: TelegramPhotoSize[]): TelegramPhotoSize | undefined {
  const sorted = [...sizes].sort((a, b) => (a.file_size ?? a.width * a.height) - (b.file_size ?? b.width * b.height));
  const fits = sorted.filter((s) => (s.file_size ?? 0) <= MAX_PHOTO_BYTES);
  return fits.length ? fits[fits.length - 1] : sorted[0];
}

async function visionModel(): Promise<RunnableModel | null> {
  const { data } = await createAdminClient().from("ai_models").select("slug, source, api_model_id").eq("slug", VISION_SLUG).maybeSingle();
  return data ? { slug: data.slug as string, source: data.source as "nvidia" | "vercel", apiModelId: data.api_model_id as string } : null;
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
}

/** Runs an image or describe command and sends the result to the chat. Usage hints are sent as plain messages. */
export async function runMediaCommand(a: MediaCommandArgs): Promise<void> {
  const say = (text: string) => sendMessage(a.token, a.chatId, clampReply(text));

  if (a.command.kind === "image") {
    if (!a.input) return void (await say(usageText(a.command)));
    if (!a.config.imageModel) return void (await say("This bot has no image model set up yet."));
    // Images are the costly call, so the limit is tighter than for text.
    rateLimit(`img:${a.botId}:${a.chatId}`, 4, 60_000);
    void sendChatAction(a.token, a.chatId, "upload_photo").catch(() => undefined);
    const img = await generateImage(a.config.imageModel, imagePrompt(a.command, a.input));
    await sendPhoto(a.token, a.chatId, Buffer.from(img.imageBase64, "base64"), a.input.slice(0, 200));
    return;
  }

  if (a.command.kind === "describe") {
    const size = a.photo?.length ? pickPhoto(a.photo) : undefined;
    if (!size) return void (await say(usageText(a.command)));
    const model = await visionModel();
    if (!model) return void (await say("This bot has no vision model set up yet."));
    rateLimit(`vision:${a.botId}:${a.chatId}`, 6, 60_000);
    void sendChatAction(a.token, a.chatId, "typing").catch(() => undefined);
    const bytes = await downloadFile(a.token, size.file_id, 400_000);
    if (bytes.length > MAX_PHOTO_BYTES * 1.4) throw Errors.invalid("That photo is too large for the vision model.");
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
    const prompt = `${a.command.instruction.trim() || "Describe this image."}${a.input ? ` ${a.input}` : ""}`.slice(0, 500);
    const r = await vlmText(model, prompt, 256, dataUrl);
    await say(r.text);
  }
}
