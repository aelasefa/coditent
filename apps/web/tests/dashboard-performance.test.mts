import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard renders section content progressively while its requests are pending", async () => {
  const page = await readSource("src/app/dashboard/page.tsx");

  assert.match(page, /aria-busy=\{journeyLoading\}/);
  assert.match(page, /actionsLoading \?/);
  assert.match(page, /recsQuery\.isLoading \?/);
  assert.match(page, /appsQuery\.isLoading \?/);
  assert.doesNotMatch(page, /const loading =|\{loading \?/);
});

test("global font loading does not add a render-blocking Google stylesheet", async () => {
  const [layout, globalCss] = await Promise.all([
    readSource("src/app/layout.tsx"),
    readSource("src/app/globals.css"),
  ]);

  assert.match(layout, /from "next\/font\/google"/);
  assert.match(layout, /preload: false/);
  assert.match(layout, /variable: "--font-inter"/);
  assert.doesNotMatch(globalCss, /fonts\.googleapis\.com|@import\s+url/);
});

test("dashboard company logos opt into responsive image optimization", async () => {
  const [jobCard, avatar] = await Promise.all([
    readSource("src/components/candidate/job-card.tsx"),
    readSource("src/components/ui/avatar.tsx"),
  ]);

  assert.match(jobCard, /<Avatar[^>]+optimize/);
  assert.match(avatar, /unoptimized=\{!optimize\}/);
  assert.match(avatar, /sizes=\{`\$\{imageSizes\[size\]\}px`\}/);
});
