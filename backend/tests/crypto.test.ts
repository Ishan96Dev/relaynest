import { describe, it } from "node:test";
import { expect } from "./expect";
import { decryptSecret, encryptSecret, maskToken, safeEqual } from "../src/lib/crypto";

const KEY = "0".repeat(63) + "1";

describe("crypto", () => {
  it("round-trips and never stores plaintext", async () => {
    const token = "123456789:AAH-secret_token_value_1234567890abcd";
    const enc = await encryptSecret(token, KEY, "v1");
    expect(enc).not.toContain(token);
    expect(await decryptSecret(enc, KEY)).toBe(token);
  });
  it("uses a fresh IV each time", async () => {
    expect(await encryptSecret("a", KEY)).not.toBe(await encryptSecret("a", KEY));
  });
  it("rejects tampering and wrong keys", async () => {
    const enc = await encryptSecret("hello", KEY);
    const parts = enc.split(".");
    parts[3] = parts[3]!.slice(0, -4) + "AAAA";
    await expect(decryptSecret(parts.join("."), KEY)).rejects.toBeTruthy();
    await expect(decryptSecret(enc, "1".repeat(64))).rejects.toBeTruthy();
  });
  it("masks tokens and compares in constant-time shape", () => {
    expect(maskToken("abc:defghijkl")).toMatch(/ijkl$/);
    expect(maskToken("abc:defghijkl")).not.toContain("defg");
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
