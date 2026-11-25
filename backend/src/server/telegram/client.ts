import "server-only";
import { serverEnv } from "@backend/lib/env/server";
import { ApiError, Errors } from "@backend/lib/http/api";
import { assertSafeOutboundUrl } from "@backend/server/workflow-engine/ssrf";

export interface TelegramLinkPreviewOptions {
  is_disabled?: boolean;
  url?: string;
  prefer_small_media?: boolean;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
}

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups: boolean;
}

export function isTelegramBotDeletedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "TELEGRAM_BOT_DELETED";
}

interface TgResponse<T> { ok: boolean; result?: T; description?: string; error_code?: number }

async function call<T>(token: string, method: string, body?: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const base = serverEnv().TELEGRAM_API_BASE_URL;
  let res: Response;
  try {
    res = await fetch(`${base}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw Errors.upstream("Could not reach Telegram.");
  }
  const json = (await res.json().catch(() => null)) as TgResponse<T> | null;
  if (!json?.ok || json.result === undefined) {
    // Telegram returns 401/404 when a bot was deleted or its token was revoked in @BotFather.
    const code = json?.error_code ?? res.status;
    if (code === 401 || code === 404) {
      throw Errors.telegramBotDeleted("Telegram rejected this token — the bot may have been deleted or its token revoked in @BotFather.");
    }
    throw Errors.upstream("Telegram request failed.");
  }
  return json.result;
}

export async function getMe(token: string, timeoutMs = 10_000): Promise<TelegramBotInfo> {
  const r = await call<{ id: number; username?: string; first_name: string; can_join_groups?: boolean }>(token, "getMe", {}, timeoutMs);
  return { id: r.id, username: r.username ?? "", firstName: r.first_name, canJoinGroups: r.can_join_groups ?? false };
}

/** Long-polling fallback for local development. Returns updates newer than `offset`. */
export function getUpdates(token: string, offset?: number) {
  return call<TelegramUpdate[]>(token, "getUpdates", { ...(offset !== undefined ? { offset } : {}), timeout: 0, limit: 25, allowed_updates: ["message"] });
}

export function setWebhook(token: string, url: string, secretToken: string) {
  return call<true>(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function getWebhookInfo(token: string, timeoutMs = 10_000) {
  return call<{ url: string; pending_update_count: number; last_error_message?: string }>(token, "getWebhookInfo", {}, timeoutMs);
}

export function deleteWebhook(token: string, dropPendingUpdates = true) {
  return call<true>(token, "deleteWebhook", { drop_pending_updates: dropPendingUpdates });
}

export function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
  parseMode?: "Markdown" | "HTML",
  opts?: { disableWebPagePreview?: boolean; linkPreviewOptions?: TelegramLinkPreviewOptions },
) {
  const previewPayload = opts?.linkPreviewOptions
    ? { link_preview_options: opts.linkPreviewOptions }
    : opts?.disableWebPagePreview
      ? { link_preview_options: { is_disabled: true } }
      : {};
  return call<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...previewPayload,
  });
}

/** Sends rich Telegram HTML first (with optional link preview card), falling back to plain text if Telegram rejects any formatting entity. */
export async function sendFormattedMessage(
  token: string,
  chatId: number | string,
  html: string,
  plainFallback: string,
  opts?: { linkPreviewUrl?: string; preferLargeMedia?: boolean },
) {
  const linkPreviewOptions: TelegramLinkPreviewOptions = opts?.linkPreviewUrl
    ? {
        is_disabled: false,
        url: opts.linkPreviewUrl,
        prefer_large_media: opts.preferLargeMedia ?? false,
        prefer_small_media: !opts.preferLargeMedia,
      }
    : { is_disabled: true };
  try {
    return await sendMessage(token, chatId, html, "HTML", { linkPreviewOptions });
  } catch (err) {
    if (isTelegramBotDeletedError(err)) throw err;
    return await sendMessage(token, chatId, plainFallback, undefined, { linkPreviewOptions });
  }
}

/** Sends a multi-part rich Telegram HTML reply cleanly in order (enabling the link preview card on the final chunk). */
export async function sendFormattedMessages(
  token: string,
  chatId: number | string,
  htmlChunks: string[],
  plainChunks: string[],
  opts?: { linkPreviewUrl?: string; preferLargeMedia?: boolean },
) {
  const count = Math.max(htmlChunks.length, 1);
  for (let i = 0; i < count; i++) {
    const html = htmlChunks[i] ?? plainChunks[i] ?? "";
    const plain = plainChunks[i] ?? htmlChunks[i] ?? "";
    if (!html && !plain) continue;
    const isLast = i === count - 1;
    await sendFormattedMessage(token, chatId, html, plain, isLast ? opts : undefined);
  }
}

/** Sends a remote HTTPS image by URL (or downloads bytes safely as fallback if Telegram cannot hotlink the origin). */
export async function sendPhotoByUrl(
  token: string,
  chatId: number | string,
  imageUrl: string,
  caption?: string,
  parseMode?: "HTML",
): Promise<boolean> {
  try {
    assertSafeOutboundUrl(imageUrl);
  } catch {
    return false;
  }
  try {
    await call<{ message_id: number }>(token, "sendPhoto", {
      chat_id: chatId,
      photo: imageUrl,
      ...(caption ? { caption: caption.slice(0, 1000) } : {}),
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }, 12_000);
    return true;
  } catch (err) {
    if (isTelegramBotDeletedError(err)) throw err;
    // Fallback: download the public image bytes and upload directly via multipart sendPhoto.
    try {
      const res = await fetch(imageUrl, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; RelayNestBot/1.0)" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return false;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!ct.startsWith("image/")) return false;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 512 || bytes.length > 5 * 1024 * 1024) return false;
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
      const plainCaption = caption ? caption.replace(/<[^>]+>/g, "") : undefined;
      await sendPhoto(token, chatId, bytes, plainCaption, `image.${ext}`, ct.split(";")[0]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Sends 1–4 web search image previews as a native Telegram photo album (sendMediaGroup), falling back gracefully if needed. */
export async function sendPhotoGallery(
  token: string,
  chatId: number | string,
  photos: Array<{ url: string; caption?: string }>,
): Promise<void> {
  const safe = photos
    .filter((p) => {
      try {
        assertSafeOutboundUrl(p.url);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 4);
  if (!safe.length) return;
  if (safe.length === 1) {
    await sendPhotoByUrl(token, chatId, safe[0]!.url, safe[0]!.caption, "HTML");
    return;
  }
  try {
    await call<unknown>(
      token,
      "sendMediaGroup",
      {
        chat_id: chatId,
        media: safe.map((p) => ({
          type: "photo",
          media: p.url,
          ...(p.caption ? { caption: p.caption.slice(0, 1000), parse_mode: "HTML" } : {}),
        })),
      },
      15_000,
    );
  } catch (err) {
    if (isTelegramBotDeletedError(err)) throw err;
    // If Telegram rejected any URL in the group (e.g. Wikimedia hotlink), send up to 2 individually with byte fallback.
    let sent = 0;
    for (const p of safe) {
      if (sent >= 2) break;
      const ok = await sendPhotoByUrl(token, chatId, p.url, p.caption, "HTML");
      if (ok) sent += 1;
    }
  }
}

export function sendChatAction(token: string, chatId: number | string, action: "typing" | "upload_photo") {
  return call<true>(token, "sendChatAction", { chat_id: chatId, action });
}

/** Sets the command menu shown in the bot's chat. Descriptions must be 1-256 characters. */
export function setMyCommands(token: string, commands: { command: string; description: string }[]) {
  return call<true>(token, "setMyCommands", { commands });
}

export function deleteMyCommands(token: string) {
  return call<true>(token, "deleteMyCommands", {});
}

export function setMyName(token: string, name: string) {
  return call<true>(token, "setMyName", { name: name.slice(0, 64) });
}

export function setMyDescription(token: string, description: string) {
  return call<true>(token, "setMyDescription", { description: description.slice(0, 512) });
}

export function setMyShortDescription(token: string, shortDescription: string) {
  return call<true>(token, "setMyShortDescription", { short_description: shortDescription.slice(0, 120) });
}

/** Updates the bot's Telegram profile photo using setMyProfilePhoto (InputProfilePhotoStatic). */
export async function setMyProfilePhoto(token: string, bytes: Uint8Array, mime = "image/jpeg", filename = "avatar.jpg"): Promise<void> {
  const form = new FormData();
  form.set("photo", JSON.stringify({ type: "static", photo: "attach://file" }));
  form.set("file", new Blob([bytes as BlobPart], { type: mime }), filename);
  let res: Response;
  try {
    res = await fetch(`${serverEnv().TELEGRAM_API_BASE_URL}/bot${token}/setMyProfilePhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw Errors.upstream("Could not reach Telegram.");
  }
  const json = (await res.json().catch(() => null)) as TgResponse<unknown> | null;
  if (!json?.ok) throw Errors.upstream(json?.description ? `Telegram: ${json.description}` : "Telegram did not accept the profile photo.");
}

export function removeMyProfilePhoto(token: string) {
  return call<true>(token, "removeMyProfilePhoto", {});
}

/** Fetches the bot's current profile photo bytes from Telegram (largest size up to 2 MB), or null if none is set. */
export async function fetchBotProfilePhoto(token: string, botId: number): Promise<Uint8Array | null> {
  try {
    const res = await call<{ total_count: number; photos: TelegramPhotoSize[][] }>(token, "getUserProfilePhotos", {
      user_id: botId,
      limit: 1,
    });
    const sizes = res.photos?.[0];
    if (!sizes?.length) return null;
    const chosen = [...sizes].reverse().find((s) => !s.file_size || s.file_size <= 2 * 1024 * 1024) ?? sizes[0];
    if (!chosen) return null;
    return await downloadFile(token, chosen.file_id, 2 * 1024 * 1024);
  } catch {
    return null;
  }
}

/** Uploads a picture (multipart, because the bytes are not at a public URL). Telegram accepts photos up to 10 MB. */
export async function sendPhoto(
  token: string,
  chatId: number | string,
  bytes: Uint8Array,
  caption?: string,
  filename = "image.jpg",
  mime?: string,
): Promise<void> {
  const detectedMime =
    mime ??
    (bytes[0] === 0x89 && bytes[1] === 0x50
      ? "image/png"
      : bytes[0] === 0x52 && bytes[1] === 0x49
        ? "image/webp"
        : "image/jpeg");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption.slice(0, 1000));
  form.set("photo", new Blob([bytes as BlobPart], { type: detectedMime }), filename);
  let res: Response;
  try {
    res = await fetch(`${serverEnv().TELEGRAM_API_BASE_URL}/bot${token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw Errors.upstream("Could not reach Telegram.");
  }
  const json = (await res.json().catch(() => null)) as TgResponse<unknown> | null;
  if (!json?.ok) throw Errors.upstream(json?.description ? `Telegram: ${json.description}` : "Telegram did not accept the picture.");
}

/** Downloads a file a user sent to the bot. Refuses anything larger than maxBytes. */
export async function downloadFile(token: string, fileId: string, maxBytes: number): Promise<Uint8Array> {
  const info = await call<{ file_path?: string; file_size?: number }>(token, "getFile", { file_id: fileId });
  if (!info.file_path) throw Errors.upstream("Telegram returned no file.");
  if (info.file_size && info.file_size > maxBytes) throw Errors.invalid("That file is too large.");
  let res: Response;
  try {
    res = await fetch(`${serverEnv().TELEGRAM_API_BASE_URL}/file/bot${token}/${info.file_path}`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw Errors.upstream("Could not reach Telegram.");
  }
  if (!res.ok) throw Errors.upstream("Telegram could not send the file.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > maxBytes) throw Errors.invalid("That file is too large.");
  return buf;
}

export interface TelegramPhotoSize { file_id: string; width: number; height: number; file_size?: number }
export interface TelegramDocument { file_id: string; file_name?: string; mime_type?: string; file_size?: number }

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    document?: TelegramDocument;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
  };
}
