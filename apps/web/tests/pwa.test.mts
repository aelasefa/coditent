import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web manifest includes standalone install metadata and required icon sizes", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon: { sizes: string }) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon: { sizes: string }) => icon.sizes === "512x512"));
});

test("service worker provides offline navigation and versioned cache cleanup", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\("\/"\)/);
  assert.match(worker, /caches\.delete/);
  assert.match(worker, /request\.method !== "GET"/);
});
