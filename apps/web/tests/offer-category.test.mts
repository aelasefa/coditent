import assert from "node:assert/strict";
import test from "node:test";
import { inferOfferCategory, isCategorySlug, offersForCategory } from "../src/lib/offer-category.ts";
import type { Offer } from "../src/lib/types.ts";

function offer(id: string, title: string, field = "Software"): Offer {
  return {
    id,
    recruiter_id: "recruiter",
    title,
    company: "Coditent",
    region: "Casablanca",
    field,
    type: "JOB",
    description: `${title} role`,
    requirements: "Teamwork",
    active: true,
    posted_at: "2026-10-14T00:00:00Z",
  };
}

test("recognizes only public offer category routes", () => {
  assert.equal(isCategorySlug("engineering"), true);
  assert.equal(isCategorySlug("all"), true);
  assert.equal(isCategorySlug("unknown"), false);
});

test("classifies and filters server-rendered offers", () => {
  const offers = [
    offer("1", "Backend engineer"),
    offer("2", "Product designer", "Design"),
    offer("3", "Customer success manager"),
  ];
  assert.equal(inferOfferCategory(offers[0]), "engineering");
  assert.equal(inferOfferCategory(offers[1]), "design");
  assert.deepEqual(offersForCategory(offers, "design").map((item) => item.id), ["2"]);
  assert.deepEqual(offersForCategory(offers, "success").map((item) => item.id), ["3"]);
  assert.equal(offersForCategory(offers, "all").length, 3);
});
