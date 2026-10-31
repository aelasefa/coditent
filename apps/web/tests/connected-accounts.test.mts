import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isOAuthPopupResult,
  OAUTH_LINK_SUCCESS,
} from "../src/lib/oauth-popup.ts";

test("link completion has a distinct correlated popup result", () => {
  assert.equal(isOAuthPopupResult({
    type: OAUTH_LINK_SUCCESS,
    attemptId: "attempt-123",
    provider: "google",
  }), true);
  assert.equal(isOAuthPopupResult({
    type: OAUTH_LINK_SUCCESS,
    attemptId: "",
    provider: "google",
  }), false);
});

test("connected accounts uses dedicated APIs and never exchanges a login handoff", async () => {
  const component = await readFile(
    new URL("../src/components/security/connected-accounts.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /startGoogleIdentityLink/);
  assert.match(component, /disconnectGoogleIdentity/);
  assert.match(component, /current_password/);
  assert.match(component, /two_factor_code/);
  assert.doesNotMatch(component, /exchangeOAuthHandoff/);
});

test("candidate and company settings expose connected accounts", async () => {
  for (const path of [
    "../src/app/dashboard/settings/page.tsx",
    "../src/app/company/settings/page.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /<ConnectedAccounts/);
  }
});
