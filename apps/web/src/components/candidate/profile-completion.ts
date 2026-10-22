import type { Profile, User } from "@/lib/types";

export const PROFILE_FIELDS = [
  { key: "headline", label: "Headline" },
  { key: "bio", label: "Summary" },
  { key: "skills", label: "Skills" },
  { key: "years_of_experience", label: "Experience" },
  { key: "city", label: "City" },
  { key: "phone", label: "Phone" },
  { key: "field_of_study", label: "Field of study" },
  { key: "university", label: "University" },
  { key: "study_level", label: "Study level" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "portfolio_url", label: "Portfolio" },
] as const;

export function getProfileCompletion(profile?: Partial<Profile> | null, avatarUrl?: string | null) {
  const missing: string[] = PROFILE_FIELDS.filter(({ key }) => {
    const value = profile?.[key];
    return value == null || String(value).trim() === "";
  }).map(({ label }) => label);
  if (!avatarUrl) missing.push("Photo");
  if (!profile?.cv_url) missing.push("CV");
  const total = PROFILE_FIELDS.length + 2;
  return { done: total - missing.length, total, missing };
}

function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== "";
}

/** The smaller, job-application-specific set of required candidate details. */
export function getApplicationProfileReadiness(
  profile?: Partial<Profile> | null,
  user?: Pick<User, "full_name"> | null
) {
  const missing: string[] = [];

  if (!hasText(user?.full_name)) missing.push("Full name");
  if (!hasText(profile?.city)) missing.push("City");
  if (!hasText(profile?.phone)) missing.push("Phone");
  if (!hasText(profile?.headline)) missing.push("Professional title");
  if (!hasText(profile?.bio)) missing.push("Professional summary");
  if (!hasText(profile?.skills)) missing.push("Skills");

  const hasExperience = profile?.years_of_experience != null;
  const hasEducation = Boolean(
    hasText(profile?.field_of_study) && hasText(profile?.university) && hasText(profile?.study_level)
  );
  if (!hasExperience && !hasEducation) missing.push("Experience or education");
  if (!hasText(profile?.cv_url)) missing.push("CV");

  return { complete: missing.length === 0, missing };
}
