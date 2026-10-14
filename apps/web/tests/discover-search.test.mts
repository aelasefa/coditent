import assert from "node:assert/strict";
import test from "node:test";

import { filterAndSortRecommendations, paginateRecommendations } from "../src/lib/discover-search.ts";
import type { Recommendation } from "../src/lib/types.ts";

function recommendation(
  id: string,
  title: string,
  field: string,
  region: string,
  type: "JOB" | "INTERNSHIP",
  score: number,
  postedAt: string,
  skills = ""
): Recommendation {
  return {
    id,
    score,
    offer: {
      id: `offer-${id}`,
      recruiter_id: "recruiter",
      title,
      company: "CODITENT Labs",
      region,
      field,
      type,
      description: "Description",
      requirements: "Requirements",
      required_skills: skills,
      active: true,
      posted_at: postedAt,
    },
  };
}

const results = [
  recommendation("1", "Backend Engineer", "Software", "Casablanca", "JOB", 82, "2026-01-01T00:00:00Z", "Python, SQL"),
  recommendation("2", "Frontend Intern", "Software", "Rabat", "INTERNSHIP", 91, "2026-03-01T00:00:00Z", "React"),
  recommendation("3", "Data Analyst", "Analytics", "Casablanca", "JOB", 74, "2026-02-01T00:00:00Z", "Python"),
];

test("discover search combines text, field, region, and type filters", () => {
  const filtered = filterAndSortRecommendations(results, {
    query: "python",
    field: "software",
    region: "casa",
    type: "JOB",
    sort: "match",
  });
  assert.deepEqual(filtered.map((item) => item.id), ["1"]);
});

test("discover search supports match and newest sorting", () => {
  const base = { query: "", field: "", region: "", type: "ALL" as const };
  assert.deepEqual(
    filterAndSortRecommendations(results, { ...base, sort: "match" }).map((item) => item.id),
    ["2", "1", "3"]
  );
  assert.deepEqual(
    filterAndSortRecommendations(results, { ...base, sort: "newest" }).map((item) => item.id),
    ["2", "3", "1"]
  );
});

test("discover pagination returns stable non-overlapping pages", () => {
  assert.deepEqual(paginateRecommendations(results, 1, 2).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(paginateRecommendations(results, 2, 2).map((item) => item.id), ["3"]);
  assert.deepEqual(paginateRecommendations(results, 3, 2), []);
});
