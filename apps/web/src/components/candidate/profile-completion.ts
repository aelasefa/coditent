import type { Profile } from "@/lib/types";

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
