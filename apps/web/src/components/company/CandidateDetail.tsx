"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/company/StatusBadge";
import { AiScore } from "./CandidateCard";
import { candidateName, jobTitleFor } from "./hiring";
import type { ApplicationItem, AssessmentItem } from "@/lib/types";

function dateTime(iso?: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CandidateDetail({
  app,
  jobTitle,
  assessment,
  canMoveStage,
  stagePending,
  chatUnlocked,
  onStage,
  onReject,
}: {
  app: ApplicationItem;
  jobTitle: string;
  assessment?: AssessmentItem | null;
  canMoveStage: boolean;
  stagePending: boolean;
  chatUnlocked: boolean;
  onStage: (status: string) => void;
  onReject: () => void;
}) {
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const c = app.candidate;
  const skills = (c as { skills?: string | null } | undefined)?.skills
    ? String((c as { skills?: string }).skills)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  return (
    <div>
      <div className="flex items-start gap-3">
        <Avatar name={candidateName(app)} size="lg" src={c?.avatar_url} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-foreground">{candidateName(app)}</h3>
          <p className="truncate text-[13px] text-muted-foreground">
            {jobTitle}
            {c?.email ? ` · ${c.email}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={app.status} size="sm" />
            <AiScore app={app} />
          </div>
        </div>
      </div>

      {canMoveStage && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Stage actions">
          {["under_review", "shortlisted", "interview", "accepted"].map((st) => (
            <Button
              key={st}
              size="sm"
              variant={app.status === st ? "primary" : "outline"}
              disabled={stagePending}
              loading={stagePending}
              onClick={() => onStage(st)}
            >
              {st.replace(/_/g, " ")}
            </Button>
          ))}
          {rejectConfirm ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-background px-2 py-1">
              <span className="text-xs font-medium text-danger">Reject candidate?</span>
              <Button size="sm" variant="danger" disabled={stagePending} onClick={onReject}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejectConfirm(false)}>
                Keep
              </Button>
            </span>
          ) : (
            app.status !== "rejected" && (
              <Button size="sm" variant="ghost" onClick={() => setRejectConfirm(true)}>
                Reject
              </Button>
            )
          )}
        </div>
      )}

      <div className="mt-4">
        <Tabs
          items={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ["Stage", app.status.replace(/_/g, " ")],
                    ["Applied", dateTime(app.created_at)],
                    ["Last update", dateTime(app.updated_at)],
                    ["Email", c?.email ?? "Not shared"],
                    ["Job", jobTitle],
                    ["Chat", chatUnlocked ? "Available" : "Locked until next stage"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              ),
            },
            {
              id: "skills",
              label: "Skills",
              content: skills.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-foreground-secondary">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No profile skills shared for this candidate.</p>
              ),
            },
            {
              id: "assessments",
              label: "Assessments",
              content: assessment ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={assessment.status} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Objective score</span>
                    <span className="font-bold text-foreground">
                      {typeof assessment.score === "number" ? assessment.score : "Pending evaluation"}
                    </span>
                  </div>
                  {assessment.report ? (
                    <div className="rounded-lg bg-surface-secondary/50 p-3">
                      <p className="text-xs font-semibold text-foreground">AI analysis</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground-secondary">{assessment.report}</p>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No AI analysis recorded for this assessment.</p>
                  )}
                  {app.ai_report ? (
                    <div className="rounded-lg bg-surface-secondary/50 p-3">
                      <p className="text-xs font-semibold text-foreground">Application AI note</p>
                      <p className="mt-1 text-[13px] text-foreground-secondary">{app.ai_report}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No practical assessment registered for this application.</p>
              ),
            },
            {
              id: "resume",
              label: "Resume",
              content: app.cv_url ? (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={app.cv_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                  >
                    Open CV
                  </a>
                  <a
                    href={app.cv_url}
                    download
                    className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-secondary"
                  >
                    Download
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No CV attached to this application.</p>
              ),
            },
            {
              id: "messages",
              label: "Messages",
              content: chatUnlocked ? (
                <a
                  href={`/chat/recruitment/${app.id}`}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Open chat with {candidateName(app)}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Chat opens after candidate moves to next stage.</p>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

export { jobTitleFor };
