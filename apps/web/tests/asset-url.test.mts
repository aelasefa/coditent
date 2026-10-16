import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetUrl } from "../src/lib/asset-url.ts";

test("company and offer logo URLs keep exactly one API proxy prefix", () => {
  const logo = "/api-proxy/companies/company-id/logo";
  assert.equal(resolveAssetUrl(logo, "/api-proxy"), logo);
  assert.equal(resolveAssetUrl(logo, "/api-proxy/"), logo);
  assert.equal(resolveAssetUrl(resolveAssetUrl(logo, "/api-proxy"), "/api-proxy"), logo);
});

test("raw API asset paths are prefixed once", () => {
  assert.equal(resolveAssetUrl("/auth/me/avatar", "/api-proxy"), "/api-proxy/auth/me/avatar");
  assert.equal(resolveAssetUrl("companies/id/logo", "/api-proxy/"), "/api-proxy/companies/id/logo");
  assert.equal(resolveAssetUrl("/api-proxy-other/image", "/api-proxy"), "/api-proxy/api-proxy-other/image");
});

test("absolute images and local upload previews are unchanged", () => {
  for (const src of ["https://example.com/logo.jpg", "http://example.com/logo.jpg", "blob:http://localhost/id", "data:image/png;base64,abc"]) {
    assert.equal(resolveAssetUrl(src, "/api-proxy"), src);
  }
  assert.equal(resolveAssetUrl("/companies/id/logo", "https://api.example.com/"), "https://api.example.com/companies/id/logo");
});

test("missing logos preserve the initials fallback", () => {
  for (const src of [null, undefined, ""]) assert.equal(resolveAssetUrl(src, "/api-proxy"), null);
});
