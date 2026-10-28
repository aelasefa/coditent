import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isCurrentOAuthPopupAttempt,
  oauthPopupAttemptKey,
} from "../src/lib/oauth-popup.ts";

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

test("OAuth popup attempts survive opener and window-name isolation", () => {
  assert.equal(oauthPopupAttemptKey("attempt-123"), "coditent:oauth:popup:attempt-123");
  assert.equal(isCurrentOAuthPopupAttempt("1000", 1000), true);
  assert.equal(isCurrentOAuthPopupAttempt(String(1000), 1000 + 10 * 60 * 1000), true);
  assert.equal(isCurrentOAuthPopupAttempt(String(1000), 1000 + 10 * 60 * 1000 + 1), false);
  assert.equal(isCurrentOAuthPopupAttempt("not-a-timestamp", 1000), false);
  assert.equal(isCurrentOAuthPopupAttempt(null, 1000), false);
});
