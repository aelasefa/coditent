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
      className={
        selected
          ? "block w-full rounded-xl border border-primary bg-surface p-4 text-left ring-2 ring-primary/20"
          : "block w-full rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-border-strong"
      }
    >
      <span className="flex items-center gap-3">
        <Avatar name={candidateName(app)} size="md" src={app.candidate?.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{candidateName(app)}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {jobTitle} · {dateLabel(app.created_at)}
          </span>
        </span>
        <StatusBadge status={app.status} size="sm" />
      </span>
      <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <AiScore app={app} />
        {app.candidate?.email ? (
          <span className="max-w-full truncate text-[11px] text-muted-foreground">{app.candidate.email}</span>
        ) : null}
        {app.chat_enabled ? (
          <span className="text-[11px] font-medium text-success">Chat open</span>
        ) : null}
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
