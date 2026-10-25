import assert from "node:assert/strict";
import test from "node:test";
import { getApplicationProfileReadiness } from "../src/components/candidate/profile-completion.ts";
import type { Profile } from "../src/lib/types.ts";

function readyProfile(overrides: Partial<Profile> = {}): Partial<Profile> {
  return {
    city: "Casablanca",
    phone: "+212600000000",
    headline: "Software engineer",
    bio: "I build reliable products.",
    skills: "TypeScript, Python",
    years_of_experience: 0,
    cv_url: "candidate/cv.pdf",
    ...overrides,
  };
}

test("an application-ready profile accepts zero years of experience", () => {
  assert.deepEqual(
    getApplicationProfileReadiness(readyProfile(), { full_name: "Candidate Name" }),
    { complete: true, missing: [] }
  );
});

test("education can satisfy the experience-or-education requirement", () => {
  const profile = readyProfile({
    years_of_experience: null,
    field_of_study: "Computer science",
    university: "University",
    study_level: "MASTER",
  });
  assert.equal(getApplicationProfileReadiness(profile, { full_name: "Candidate Name" }).complete, true);
});

test("application readiness reports every missing required detail", () => {
  assert.deepEqual(getApplicationProfileReadiness({}, { full_name: "" }).missing, [
    "Full name",
    "City",
    "Phone",
    "Professional title",
    "Professional summary",
    "Skills",
    "Experience or education",
    "CV",
  ]);
});
