import { describe, it } from "node:test";
import { expect } from "./expect";
import { assertSafeOutboundUrl } from "../src/server/workflow-engine/ssrf";

describe("assertSafeOutboundUrl", () => {
  for (const u of [
    "http://example.com",
    "https://localhost/x",
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/",
    "https://[::1]/",
    "https://user:pass@example.com/",
    "https://example.com:22/",
    "https://2130706433/",
    "https://0x7f.0.0.1/",
  ]) {
    it(`blocks ${u}`, () => expect(() => assertSafeOutboundUrl(u)).toThrow());
  }
  it("allows public https", () => {
    expect(assertSafeOutboundUrl("https://api.example.com/hook").hostname).toBe("api.example.com");
  });
});
