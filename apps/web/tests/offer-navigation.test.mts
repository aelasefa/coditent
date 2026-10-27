import assert from "node:assert/strict";
import test from "node:test";
import { getOfferDiscoverPath, getOfferLoginPath } from "../src/lib/offer-navigation.ts";

test("keeps the selected public offer when continuing to Discover", () => {
  assert.equal(
    getOfferDiscoverPath("offer/with spaces"),
    "/dashboard/recommendations?offer=offer%2Fwith%20spaces"
  );
});

test("sends signed-out candidates through login with the Discover deep link", () => {
  assert.equal(
    getOfferLoginPath("offer-42"),
    "/login?next=%2Fdashboard%2Frecommendations%3Foffer%3Doffer-42"
  );
});
