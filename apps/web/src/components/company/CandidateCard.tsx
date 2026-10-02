"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/company/StatusBadge";
import { aiState, candidateInitials, candidateName, hiringStage, jobTitleFor } from "@/components/company/hiring";
import type { ApplicationItem } from "@/lib/types";

function dateLabel(iso?: string | null): string {
  if (!iso) return "Recent";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recent";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AiScore({ app }: { app: ApplicationItem }) {
  const state = aiState(app);
  if (state === "scored") {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
        AI {app.ai_score}
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-background px-2 py-0.5 text-[11px] font-medium text-danger">
        Screening failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span aria-hidden className="h-1 w-1 animate-pulse rounded-full bg-current" />
      AI pending
    </span>
  );
}

export function CandidateCard({
  app,
  jobTitle,
  selected,
  onOpen,
}: {
  app: ApplicationItem;
  jobTitle: string;
  selected?: boolean;
  onOpen: () => void;
}) {
  const stage = hiringStage(app.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${candidateName(app)}, ${jobTitle}, stage ${stage}`}
      aria-haspopup="dialog"
      className={`company-candidate-card ${selected ? "company-candidate-card-selected" : ""}`}
    >
      <span className="company-candidate-card-main">
        <Avatar name={candidateName(app)} size="md" src={app.candidate?.avatar_url} />
        <span className="company-candidate-card-identity">
          <span className="company-candidate-card-name">{candidateName(app)}</span>
          <span className="company-candidate-card-role">
            {jobTitle} · {dateLabel(app.created_at)}
          </span>
        </span>
        <StatusBadge status={app.status} size="sm" />
      </span>
      <span className="company-candidate-card-footer">
        <span className="company-candidate-card-email">
          {app.candidate?.email ? (
            <span className="company-candidate-card-email-text">{app.candidate.email}</span>
          ) : (
            <span className="company-candidate-card-email-text">Email not shared</span>
          )}
        </span>
        {app.chat_enabled ? (
          <span className="company-candidate-card-chat">Chat open</span>
        ) : null}
        <span className="company-candidate-card-action">View profile</span>
      </span>
    </button>
  );
}

export function CandidateRowLink({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/company/candidates?app=${appId}`}
      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
      aria-label="Open candidate detail"
    >
      {children}
    </Link>
  );
}

export { candidateInitials };
