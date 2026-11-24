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
      if (req.url?.endsWith("/getFile")) return ok({ file_path: "photos/file_1.jpg", file_size: PHOTO.length });
      if (req.url?.includes("/file/bot")) { res.setHeader("content-type", "image/jpeg"); return void res.end(PHOTO); }
      if (req.url?.endsWith("/getUpdates")) return ok([{ update_id: 7, message: { message_id: 1, text: "hi", chat: { id: 5, type: "private" } } }]);
      if (req.url?.endsWith("/sendPhoto")) return ok({ message_id: 9 });
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
});

describe("photo choice for vision commands", () => {
  it("picks the largest size under the inline limit, or the smallest when none fits", async () => {
    const { pickPhoto } = await import("../src/server/services/ai-agent-commands");
    const sizes = [
      { file_id: "s", width: 90, height: 90, file_size: 2_000 },
      { file_id: "m", width: 320, height: 320, file_size: 30_000 },
      { file_id: "l", width: 800, height: 800, file_size: 110_000 },
      { file_id: "xl", width: 1280, height: 1280, file_size: 400_000 },
    ];
    expect(pickPhoto(sizes)?.file_id).toBe("l");
    expect(pickPhoto([{ file_id: "big", width: 1280, height: 1280, file_size: 500_000 }, { file_id: "bigger", width: 2000, height: 2000, file_size: 900_000 }])?.file_id).toBe("big");
    expect(pickPhoto([])).toBe(undefined);
  });
});
