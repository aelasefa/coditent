"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/company/StatusBadge";
import { AiScore } from "./CandidateCard";
import { candidateName, jobTitleFor } from "./hiring";
import { getApiBaseUrl, retryApplicationScreening } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { ApplicationItem, AssessmentItem } from "@/lib/types";

function parseScreeningReport(report?: string | null): { summary: string; strengths: string[]; gaps: string[] } | null {
  if (!report) return null;
  try {
    const parsed = JSON.parse(report) as { summary?: unknown; strengths?: unknown; gaps?: unknown };
    if (typeof parsed.summary !== "string") return null;
    return {
      summary: parsed.summary,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
    };
  } catch {
    return { summary: report, strengths: [], gaps: [] };
  }
}

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const screening = parseScreeningReport(app.ai_report);
  const screenMut = useMutation({
    mutationFn: () => retryApplicationScreening(app.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast("Screening restarted", { variant: "success" });
    },
    onError: () => toast("Could not restart screening", { variant: "error" }),
  });
  const c = app.candidate;
  // Single source of truth: CandidateProfile.skills, serialized into the
  // application payload (candidate.skills, profile.skills). Only genuinely
  // empty collections render the empty notice.
  const rawSkills = c?.skills ?? app.profile?.skills ?? null;
  const skills = rawSkills
    ? String(rawSkills)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  // Private storage: never link raw paths. View/Download go through the
  // company-isolated GET /applications/{id}/cv endpoint.
  const cvDownloadPath = app.cv?.download_url ?? null;
  const cvHref = cvDownloadPath
    ? `${getApiBaseUrl()}${cvDownloadPath.startsWith("/") ? cvDownloadPath : `/${cvDownloadPath}`}`
    : null;
  const cvFilename = app.cv?.filename ?? null;

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
              content: (
                <div className="space-y-4">
                  <div className="mb-4 rounded-xl border border-border-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">AI screening</p>
                    <AiScore app={app} />
                  </div>
                  {app.ai_status === "failed" ? (
                    <div className="mt-2">
                      <p className="text-[13px] text-muted-foreground">Screening did not complete. Retry runs it again.</p>
                      {canMoveStage ? (
                        <Button size="sm" variant="outline" loading={screenMut.isPending} onClick={() => screenMut.mutate()} className="mt-2">
                          Retry screening
                        </Button>
                      ) : null}
                    </div>
                  ) : screening ? (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[13px] leading-relaxed text-foreground-secondary">{screening.summary}</p>
                      {screening.strengths.length > 0 ? (
                        <p className="text-[13px] text-foreground-secondary"><span className="font-semibold text-foreground">Strengths: </span>{screening.strengths.join("; ")}</p>
                      ) : null}
                      {screening.gaps.length > 0 ? (
                        <p className="text-[13px] text-foreground-secondary"><span className="font-semibold text-foreground">Gaps: </span>{screening.gaps.join("; ")}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {app.ai_status === "processing" ? "Screening is running." : "Screening has not run yet."}
                    </p>
                  )}
                </div>
                  {assessment ? (
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
              )}
                </div>
              ),
            },
            {
              id: "resume",
              label: "Resume",
              content: cvHref ? (
                <div className="space-y-2">
                  {cvFilename ? (
                    <p className="truncate text-[13px] font-medium text-foreground" title={cvFilename}>
                      {cvFilename}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={cvHref}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                    >
                      Open CV
                    </a>
                    <a
                      href={cvHref}
                      download={cvFilename ?? true}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-secondary"
                    >
                      Download
                    </a>
                  </div>
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
