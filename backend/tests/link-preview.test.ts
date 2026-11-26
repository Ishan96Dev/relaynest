import assert from "node:assert/strict";
import test from "node:test";
import {
  extractExternalLinks,
  extractYoutubeThumbnail,
  getFaviconUrl,
  normalizeLinkKey,
  safeDisplayDomain,
  safeDisplayPath,
} from "@backend/server/ai/link-preview-types";
import { parseLinkPreviewHtml } from "@backend/server/search/link-preview";

test("parseLinkPreviewHtml extracts OpenGraph title, description, image, siteName and favicon", () => {
  const html = `<!doctype html><html><head>
    <title>Fallback Title</title>
    <meta property="og:title" content="Katonic &amp; Enterprise AI Platform" />
    <meta content="Deploy private LLMs &quot;securely&quot; in your VPC." property="og:description" />
    <meta property="og:site_name" content="Katonic AI" />
    <meta property="og:image" content="/assets/og-banner.png" />
    <link rel="icon" href="/favicon.svg" />
  </head><body><h1>Hello</h1></body></html>`;

  const parsed = parseLinkPreviewHtml(html, "https://katonic.ai/platform/overview");
  assert.equal(parsed.domain, "katonic.ai");
  assert.equal(parsed.title, "Katonic & Enterprise AI Platform");
  assert.equal(parsed.description, 'Deploy private LLMs "securely" in your VPC.');
  assert.equal(parsed.siteName, "Katonic AI");
  assert.equal(parsed.image, "https://katonic.ai/assets/og-banner.png");
  assert.equal(parsed.favicon, "https://katonic.ai/favicon.svg");
});

test("parseLinkPreviewHtml blocks unsafe private/javascript OG image URLs and falls back cleanly", () => {
  const html = `<html><head>
    <title>Docs &mdash; Example</title>
    <meta name="description" content="Helpful documentation." />
    <meta property="og:image" content="http://127.0.0.1/secret.png" />
    <link rel="icon" href="javascript:alert(1)" />
  </head></html>`;

  const parsed = parseLinkPreviewHtml(html, "https://docs.example.com/guide");
  assert.equal(parsed.title, "Docs — Example");
  assert.equal(parsed.description, "Helpful documentation.");
  assert.equal(parsed.image, undefined);
  assert.equal(parsed.favicon, getFaviconUrl("docs.example.com"));
});

test("extractYoutubeThumbnail detects standard, short, and youtu.be URLs", () => {
  assert.equal(
    extractYoutubeThumbnail("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  assert.equal(
    extractYoutubeThumbnail("https://youtu.be/dQw4w9WgXcQ?t=12"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  assert.equal(
    extractYoutubeThumbnail("https://youtube.com/shorts/dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
  assert.equal(extractYoutubeThumbnail("https://example.com/watch?v=dQw4w9WgXcQ"), undefined);
});

test("extractExternalLinks skips code blocks, deduplicates normalized URLs, and preserves labels", () => {
  const md = [
    "Check out [Katonic](https://www.katonic.ai/) and https://katonic.ai#top.",
    "Also see https://docs.github.com/en/get-started.",
    "```ts\nconst ignored = 'https://ignored.example.com';\n```",
    "Inline `https://also-ignored.example.com` should not appear.",
  ].join("\n");

  const links = extractExternalLinks(md, 4);
  assert.equal(links.length, 2);
  assert.equal(links[0]?.url, "https://www.katonic.ai/");
  assert.equal(links[0]?.label, "Katonic");
  assert.equal(links[1]?.url, "https://docs.github.com/en/get-started");
  assert.equal(normalizeLinkKey("https://www.katonic.ai/"), normalizeLinkKey("https://katonic.ai#hero"));
  assert.equal(safeDisplayDomain("https://www.microsoft.com/en-us"), "microsoft.com");
  assert.equal(safeDisplayPath("https://www.microsoft.com/en-us/ai/"), "microsoft.com/en-us/ai");
});
