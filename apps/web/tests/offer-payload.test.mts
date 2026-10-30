import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCreateOfferPayload,
  buildUpdateOfferPayload,
  extractDescriptionDetails,
  type JobFormState,
} from "../src/lib/offer-payload.ts";

function form(overrides: Partial<JobFormState> = {}): JobFormState {
  return {
    title: "Platform Engineer",
    region: "Casablanca",
    field: "Engineering",
    type: "JOB",
    description: "Build and operate the platform.",
    requirements: "Strong TypeScript and PostgreSQL experience.",
    salaryMin: "100000",
    salaryMax: "150000",
    equity: "0.5% options",
    workMode: "hybrid",
    legacyCompensation: "",
    ...overrides,
  };
}

test("Create Job emits only backend schema fields", () => {
  const payload = buildCreateOfferPayload(form());

  assert.deepEqual(payload, {
    title: "Platform Engineer",
    region: "Casablanca",
    field: "Engineering",
    type: "JOB",
    description: "Build and operate the platform.\n\nEquity: 0.5% options",
    requirements: "Strong TypeScript and PostgreSQL experience.",
    work_mode: "hybrid",
    salary_min: 100000,
    salary_max: 150000,
  });
  assert.equal("salaryRange" in payload, false);
  assert.equal("salaryMin" in payload, false);
  assert.equal("equity" in payload, false);
  assert.equal("company" in payload, false);
});

test("Edit Job is idempotent and does not duplicate equity metadata", () => {
  const first = buildUpdateOfferPayload(form());
  const extracted = extractDescriptionDetails(first.description ?? "");
  const second = buildUpdateOfferPayload(form({
    description: extracted.description,
    equity: extracted.equity,
    legacyCompensation: extracted.legacyCompensation,
  }));

  assert.equal(second.description, first.description);
  assert.equal(second.description?.match(/^Equity:/gm)?.length, 1);
});

test("editing preserves legacy free-form compensation without sending it as a field", () => {
  const existing = extractDescriptionDetails(
    "Maintain the payments platform.\n\nCompensation: $200k – $350k / yr\nEquity: Fund economics",
  );
  const payload = buildUpdateOfferPayload(form({
    description: existing.description,
    equity: existing.equity,
    legacyCompensation: existing.legacyCompensation,
    salaryMin: "",
    salaryMax: "",
    workMode: "",
  }));

  assert.equal(payload.salary_min, null);
  assert.equal(payload.salary_max, null);
  assert.equal(payload.work_mode, null);
  assert.equal(
    payload.description,
    "Maintain the payments platform.\n\nCompensation: $200k – $350k / yr\nEquity: Fund economics",
  );
});

test("salary validation rejects invalid values before the request", () => {
  assert.throws(
    () => buildCreateOfferPayload(form({ salaryMin: "150001", salaryMax: "150000" })),
    /Minimum salary must be less than or equal to maximum salary/,
  );
  assert.throws(
    () => buildCreateOfferPayload(form({ salaryMin: "10.5" })),
    /Minimum salary must be a whole number/,
  );
});

test("Edit Job uses PATCH and the company input is not editable", async () => {
  const [apiSource, pageSource] = await Promise.all([
    readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/company/jobs/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(apiSource, /api\.patch<Offer>\(`\/offers\/\$\{offerId\}`/);
  assert.doesNotMatch(pageSource, /api\.put\(`\/offers/);
  assert.match(pageSource, /label="Company" value=\{company\?\.name \?\? ""\} disabled readOnly/);
  assert.match(pageSource, /buildCreateOfferPayload\(form\)/);
  assert.match(pageSource, /buildUpdateOfferPayload\(editForm\)/);
});
