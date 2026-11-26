import { after, before, describe, it } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "./expect";

/** A tiny fake of the Telegram Bot API that records what the client sends. */
interface Seen { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }
const seen: Seen[] = [];
let server: http.Server;

const TOKEN = "123456789:AAH-test_token_value_1234567890abcdef";
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

before(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      const ok = (result: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, result })); };
      if (req.url?.includes("/botrevoked:")) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        return void res.end(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }));
      }
      if (req.url?.includes("/botratelimited:")) {
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        res.setHeader("retry-after", "12");
        return void res.end(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: "Too Many Requests: retry after 12",
            parameters: { retry_after: 12 },
          }),
        );
      }
      if (req.url?.endsWith("/getFile")) return ok({ file_path: "photos/file_1.jpg", file_size: PHOTO.length });
      if (req.url?.includes("/file/bot")) { res.setHeader("content-type", "image/jpeg"); return void res.end(PHOTO); }
      if (req.url?.endsWith("/getUpdates")) return ok([{ update_id: 7, message: { message_id: 1, text: "hi", chat: { id: 5, type: "private" } } }]);
      if (req.url?.endsWith("/sendPhoto")) return ok({ message_id: 9 });
      if (req.url?.endsWith("/sendMediaGroup")) return ok([{ message_id: 10 }, { message_id: 11 }]);
      ok(true);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SECRET_KEY = "test";
  process.env.ENCRYPTION_KEY = "0".repeat(63) + "1";
});

after(() => { server.close(); });

describe("telegram client against a fake Bot API", () => {
  it("sends photos as multipart with chat id, caption and the image bytes", async () => {
    const { sendPhoto } = await import("../src/server/telegram/client");
    seen.length = 0;
    await sendPhoto(TOKEN, 42, PHOTO, "a red fox");
    const req = seen.at(-1)!;
    expect(req.url).toBe(`/bot${TOKEN}/sendPhoto`);
    expect(req.headers["content-type"] ?? "").toContain("multipart/form-data");
    const text = req.body.toString("latin1");
    expect(text).toContain('name="chat_id"');
    expect(text).toContain("42");
    expect(text).toContain('name="caption"');
    expect(text).toContain("a red fox");
    expect(text).toContain('name="photo"; filename="image.jpg"');
    expect(req.body.includes(PHOTO)).toBe(true);
  });

  it("publishes the command menu", async () => {
    const { setMyCommands } = await import("../src/server/telegram/client");
    seen.length = 0;
    await setMyCommands(TOKEN, [{ command: "imagine", description: "Draw" }]);
    expect(JSON.parse(seen.at(-1)!.body.toString())).toEqual({ commands: [{ command: "imagine", description: "Draw" }] });
  });

  it("downloads a user's photo through getFile", async () => {
    const { downloadFile } = await import("../src/server/telegram/client");
    const bytes = await downloadFile(TOKEN, "abc", 1_000);
    expect(Buffer.from(bytes).equals(PHOTO)).toBe(true);
    await expect(downloadFile(TOKEN, "abc", 4)).rejects.toBeTruthy(); // larger than the allowed size
  });

  it("fetches updates with the next offset", async () => {
    const { getUpdates } = await import("../src/server/telegram/client");
    seen.length = 0;
    const updates = await getUpdates(TOKEN, 8);
    expect(updates[0]?.update_id).toBe(7);
    const sent = JSON.parse(seen.at(-1)!.body.toString());
    expect(sent.offset).toBe(8);
    expect(sent.timeout).toBe(0);
  });

  it("clears commands and pending webhook updates cleanly on delete, and detects 401 revoked/deleted bots", async () => {
    const { deleteMyCommands, deleteWebhook, getMe, isTelegramBotDeletedError } = await import("../src/server/telegram/client");
    seen.length = 0;
    await deleteWebhook(TOKEN, true);
    expect(seen.at(-1)!.url).toBe(`/bot${TOKEN}/deleteWebhook`);
    expect(JSON.parse(seen.at(-1)!.body.toString())).toEqual({ drop_pending_updates: true });

    await deleteMyCommands(TOKEN);
    expect(seen.at(-1)!.url).toBe(`/bot${TOKEN}/deleteMyCommands`);

    let caught: unknown;
    try {
      await getMe("revoked:AAH-dead-token");
    } catch (e) {
      caught = e;
    }
    expect(isTelegramBotDeletedError(caught)).toBe(true);
  });

  it("sends rich formatted multi-part messages with link_preview_options and photo galleries via sendMediaGroup", async () => {
    const { sendFormattedMessages, sendPhotoGallery } = await import("../src/server/telegram/client");
    seen.length = 0;
    await sendFormattedMessages(TOKEN, 42, ["<b>Part 1</b>", "<b>Part 2</b>"], ["Part 1", "Part 2"], {
      linkPreviewUrl: "https://example.com/article",
      preferLargeMedia: true,
    });
    expect(seen.length).toBe(2);
    const first = JSON.parse(seen[0]!.body.toString());
    const second = JSON.parse(seen[1]!.body.toString());
    expect(first.parse_mode).toBe("HTML");
    expect(first.link_preview_options.is_disabled).toBe(true);
    expect(second.link_preview_options).toEqual({
      is_disabled: false,
      url: "https://example.com/article",
      prefer_large_media: true,
      prefer_small_media: false,
    });

    seen.length = 0;
    await sendPhotoGallery(TOKEN, 42, [
      { url: "https://images.example.com/one.jpg", caption: "<b>One</b>" },
      { url: "https://images.example.com/two.jpg", caption: "Two" },
    ]);
    expect(seen.at(-1)!.url).toBe(`/bot${TOKEN}/sendMediaGroup`);
    const groupPayload = JSON.parse(seen.at(-1)!.body.toString());
    expect(groupPayload.media.length).toBe(2);
    expect(groupPayload.media[0].type).toBe("photo");
    expect(groupPayload.media[0].parse_mode).toBe("HTML");
  });

  it("parses Telegram 429 retry_after and never fires fallback sends on rate limits", async () => {
    const {
      getTelegramRetryAfterSec,
      isTelegramRateLimitError,
      sendFormattedMessage,
      sendPhotoGallery,
    } = await import("../src/server/telegram/client");

    seen.length = 0;
    let caught: unknown;
    try {
      await sendFormattedMessage("ratelimited:AAH-flood", 42, "<b>Hi</b>", "Hi");
    } catch (e) {
      caught = e;
    }
    expect(isTelegramRateLimitError(caught)).toBe(true);
    expect(getTelegramRetryAfterSec(caught)).toBe(12);
    // Must not amplify 429 by retrying as plain text.
    expect(seen.length).toBe(1);

    seen.length = 0;
    let galleryErr: unknown;
    try {
      await sendPhotoGallery("ratelimited:AAH-flood", 42, [
        { url: "https://images.example.com/one.jpg", caption: "One" },
        { url: "https://images.example.com/two.jpg", caption: "Two" },
      ]);
    } catch (e) {
      galleryErr = e;
    }
    expect(isTelegramRateLimitError(galleryErr)).toBe(true);
    expect(getTelegramRetryAfterSec(galleryErr)).toBe(12);
    // Must not fall back to individual sendPhoto calls on 429.
    expect(seen.length).toBe(1);
  });
});

describe("photo choice for vision commands", () => {
  it("picks the largest high-res size under the 2 MB limit, or the smallest when none fits", async () => {
    const { pickPhoto } = await import("../src/server/services/ai-agent-commands");
    const sizes = [
      { file_id: "s", width: 90, height: 90, file_size: 2_000 },
      { file_id: "m", width: 320, height: 320, file_size: 30_000 },
      { file_id: "l", width: 800, height: 800, file_size: 110_000 },
      { file_id: "xl", width: 1280, height: 1280, file_size: 400_000 },
      { file_id: "huge", width: 4096, height: 4096, file_size: 3_500_000 },
    ];
    expect(pickPhoto(sizes)?.file_id).toBe("xl");
    expect(pickPhoto([{ file_id: "big", width: 2560, height: 2560, file_size: 2_500_000 }, { file_id: "bigger", width: 4000, height: 4000, file_size: 4_000_000 }])?.file_id).toBe("big");
    expect(pickPhoto([])).toBe(undefined);
  });
});
