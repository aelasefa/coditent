"use client";

import type { Profile } from "@/lib/types";

interface CandidateProfilePanelProps {
  profile: Profile | null | undefined;
  candidateName?: string | null;
  candidateEmail?: string | null;
}

function display(value: string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value.trim() === "") {
    return fallback;
  }
  return value;
}

const STUDY_LEVEL_LABEL: Record<string, string> = {
  BAC: "Baccalauréat",
  LICENCE: "Licence",
  MASTER: "Master",
  DOCTORAT: "Doctorat",
};

export function CandidateProfilePanel({
  profile,
  candidateName,
  candidateEmail,
}: CandidateProfilePanelProps) {
  const skills = (profile?.skills ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

  return (
    <div className="mt-3 rounded-md border border-md-outline/20 bg-md-background/40 p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">
          Candidate profile
        </p>
        {profile?.updated_at ? (
          <p className="text-xs text-md-onSurfaceVariant">
            Updated {new Date(profile.updated_at).toLocaleDateString()}
          </p>
        ) : null}
      </div>

      {candidateName ? (
        <p className="text-base font-medium">{display(candidateName, "")}</p>
      ) : null}
      {candidateEmail ? (
        <p className="text-xs text-md-onSurfaceVariant">{display(candidateEmail, "")}</p>
      ) : null}

      {profile?.headline ? (
        <p className="mt-2 text-sm font-medium text-md-foreground">{profile.headline}</p>
      ) : null}

      {profile?.bio ? (
        <p className="mt-1 text-sm leading-7 text-md-onSurfaceVariant">{profile.bio}</p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <InfoRow label="Field of study" value={display(profile?.field_of_study)} />
        <InfoRow label="University" value={display(profile?.university)} />
        <InfoRow
          label="Study level"
          value={
            profile?.study_level
              ? STUDY_LEVEL_LABEL[profile.study_level] ?? profile.study_level
              : "—"
          }
        />
        <InfoRow
          label="Years of experience"
          value={
            profile?.years_of_experience === null || profile?.years_of_experience === undefined
              ? "—"
              : String(profile.years_of_experience)
          }
        />
        <InfoRow label="City" value={display(profile?.city)} />
        <InfoRow label="Phone" value={display(profile?.phone)} />
      </div>

      {skills.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">Skills</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex rounded-full bg-md-secondaryContainer px-2.5 py-0.5 text-xs font-medium text-md-onSecondaryContainer"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {profile?.linkedin_url ? (
          <a
            className="font-medium text-md-primary underline decoration-md-primary/40 underline-offset-4"
            href={profile.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn ↗
          </a>
        ) : null}
        {profile?.portfolio_url ? (
          <a
            className="font-medium text-md-primary underline decoration-md-primary/40 underline-offset-4"
            href={profile.portfolio_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Portfolio ↗
          </a>
        ) : null}
      </div>

      {!profile ? (
        <p className="mt-3 text-xs text-md-onSurfaceVariant">
          This candidate has not completed their profile yet.
        </p>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">{label}</p>
      <p className="text-sm text-md-foreground">{value}</p>
    </div>
  );
}
