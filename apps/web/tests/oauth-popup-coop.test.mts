import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sources = [
  new URL("../src/components/social-login-buttons.tsx", import.meta.url),
  new URL("../src/app/auth/sso/callback/page.tsx", import.meta.url),
];

test("OAuth popup handoff does not inspect Window.closed across origins", async () => {
  for (const source of sources) {
    const contents = await readFile(source, "utf8");
    assert.doesNotMatch(contents, /\.closed\b/);
  }
});
