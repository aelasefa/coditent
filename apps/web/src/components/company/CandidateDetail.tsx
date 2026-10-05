"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { AiScore } from "./CandidateCard";
import { candidateName, jobTitleFor } from "./hiring";
import { createInterviewFeedback, getApiBaseUrl, getMe, listInterviewFeedback, retryApplicationScreening, updateInterviewFeedback } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { ApplicationItem, InterviewRecommendation } from "@/lib/types";
import {
  FiActivity,
  FiAlertCircle,
  FiAward,
  FiCheckCircle,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiGitBranch,
  FiMessageSquare,
  FiX,
} from "react-icons/fi";

const NEXT_STAGES: Record<string, string[]> = {
  applied: ["under_review", "rejected"],
  under_review: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

const STAGE_LABELS: Record<string, string> = {
  under_review: "Review",
  shortlisted: "Shortlist",
  accepted: "Hire",
};

function parseScreeningReport(report?: string | null): { summary: string; strengths: string[]; gaps: string[] } | null {
  if (!report) return null;
  try {
    const parsed = JSON.parse(report) as { summary?: unknown; strengths?: unknown; gaps?: unknown };
    if (typeof parsed.summary !== "string") return { summary: report, strengths: [], gaps: [] };
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
  canMoveStage,
  stagePending,
  chatUnlocked,
  onStage,
  onReject,
}: {
  app: ApplicationItem;
  jobTitle: string;
  canMoveStage: boolean;
  stagePending: boolean;
  chatUnlocked: boolean;
  onStage: (
    status: string,
    interview?: { scheduledAt: string; notes?: string }
  ) => void;
  onReject: () => void;
}) {
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const [interviewAt, setInterviewAt] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 3,
    recommendation: "neutral" as InterviewRecommendation,
    strengths: "",
    concerns: "",
    notes: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const screening = parseScreeningReport(app.ai_report);
  const screeningTextLength = screening
    ? [screening.summary, ...screening.strengths, ...screening.gaps].join(" ").length
    : 0;
  const screeningNeedsWideLayout = Boolean(
    screening &&
      (screeningTextLength > 360 || screening.strengths.length + screening.gaps.length >= 4)
  );
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const feedbackQ = useQuery({
    queryKey: ["interview-feedback", app.id],
    queryFn: () => listInterviewFeedback(app.id),
    enabled: Boolean(app.interview_scheduled_at),
  });
  const myFeedback = feedbackQ.data?.find((entry) => entry.reviewer_id === meQ.data?.id);
  useEffect(() => {
    if (!myFeedback) return;
    setFeedbackForm({
      rating: myFeedback.rating,
      recommendation: myFeedback.recommendation,
      strengths: myFeedback.strengths,
      concerns: myFeedback.concerns ?? "",
      notes: myFeedback.notes ?? "",
    });
  }, [myFeedback]);
  const feedbackMut = useMutation({
    mutationFn: () => myFeedback
      ? updateInterviewFeedback(app.id, myFeedback.id, {
          expected_version: myFeedback.version,
          ...feedbackForm,
        })
      : createInterviewFeedback(app.id, feedbackForm),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interview-feedback", app.id] });
      toast(myFeedback ? "Interview feedback updated" : "Interview feedback saved", { variant: "success" });
    },
    onError: () => toast("Interview feedback could not be saved", { variant: "error" }),
  });
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
  const nextStages = NEXT_STAGES[app.status] ?? [];
  const nonInterviewStages = nextStages.filter(
    (stage) => stage !== "interview" && stage !== "rejected"
  );

  return (
    <div className={`company-candidate-detail${canMoveStage ? " company-candidate-detail-manageable" : ""}`}>
      {canMoveStage && (
        <section
          className="company-candidate-stage-actions"
          aria-labelledby="candidate-stage-actions-title"
          aria-busy={stagePending}
        >
          <div className="company-candidate-stage-field">
            <label id="candidate-stage-actions-title" htmlFor="candidate-stage-select">
              <FiGitBranch aria-hidden="true" /> Stage
            </label>
            <select
              id="candidate-stage-select"
              value={app.status}
              disabled={stagePending}
              aria-describedby="candidate-stage-save-status"
              onChange={(event) => {
                const status = event.target.value;
                if (status === app.status || stagePending) return;
                setRejectConfirm(false);
                onStage(status);
              }}
            >
              <option value={app.status} disabled>
                {app.status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </option>
              {nonInterviewStages.map((stage) => (
                <option key={stage} value={stage}>{STAGE_LABELS[stage] ?? stage}</option>
              ))}
            </select>
            <p id="candidate-stage-save-status" role="status" className="sr-only">
              {stagePending ? "Updating pipeline…" : "Stage changes save automatically."}
            </p>
          </div>
          {nextStages.includes("interview") ? (
            <div className="rounded-xl border border-border-subtle bg-surface-secondary/30 p-3">
              <p className="text-xs font-semibold text-foreground">Schedule interview</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="datetime-local"
                  value={interviewAt}
                  onChange={(event) => setInterviewAt(event.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  aria-label="Interview date and time"
                />
                <input
                  type="text"
                  maxLength={2000}
                  value={interviewNotes}
                  onChange={(event) => setInterviewNotes(event.target.value)}
                  placeholder="Location or meeting details (optional)"
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  aria-label="Interview notes"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={stagePending || !interviewAt}
                loading={stagePending}
                onClick={() => onStage("interview", {
                  scheduledAt: new Date(interviewAt).toISOString(),
                  notes: interviewNotes,
                })}
              >
                Schedule interview
              </Button>
            </div>
          ) : null}
          <div className="company-candidate-stage-secondary">
            {rejectConfirm ? (
              <span className="company-candidate-reject-confirm">
                <span>Reject candidate?</span>
                <Button size="sm" variant="danger" disabled={stagePending} onClick={onReject}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejectConfirm(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              nextStages.includes("rejected") && (
                <Button size="sm" variant="ghost" className="company-candidate-reject-trigger" aria-label="Reject application" disabled={stagePending} onClick={() => setRejectConfirm(true)}>
                  <FiX aria-hidden="true" /> Reject
                </Button>
              )
            )}
          </div>
        </section>
      )}

      <div className="company-candidate-tabs">
        <Tabs
          items={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <div className="company-candidate-overview company-candidate-overview-panel">
                  <dl className="company-candidate-detail-grid">
                    <div>
                      <dt className="company-detail-label">Applied</dt>
                      <dd>{dateTime(app.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="company-detail-label">Last update</dt>
                      <dd>{dateTime(app.updated_at)}</dd>
                    </div>
                    <div>
                      <dt className="company-detail-label">Email</dt>
                      <dd>{c?.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "Not shared"}</dd>
                    </div>
                    <div>
                      <dt className="company-detail-label">Job</dt>
                      <dd>{jobTitle}</dd>
                    </div>
                    <div>
                      <dt className="company-detail-label">Interview</dt>
                      <dd>{app.interview_scheduled_at ? dateTime(app.interview_scheduled_at) : "Not scheduled"}</dd>
                    </div>
                  </dl>

                  <section className={chatUnlocked ? "company-candidate-chat-status company-candidate-chat-status-open" : "company-candidate-chat-status"} aria-label="Recruitment chat">
                    <div>
                      <p className="company-detail-label">Recruitment chat</p>
                      <p>{chatUnlocked ? "Chat is available for this candidate." : "Chat unlocks when the candidate reaches the next stage."}</p>
                    </div>
                    <span>{chatUnlocked ? "Available" : "Locked"}</span>
                  </section>
                </div>
              ),
            },
            {
              id: "interview",
              label: "Interview",
              content: app.interview_scheduled_at ? (
                <div className="space-y-5">
                  <div className="rounded-lg bg-surface-secondary/50 p-3 text-sm">
                    <p className="font-semibold text-foreground">Scheduled {dateTime(app.interview_scheduled_at)}</p>
                    {app.interview_notes ? <p className="mt-1 text-muted-foreground">{app.interview_notes}</p> : null}
                  </div>
                  {canMoveStage ? (
                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); feedbackMut.mutate(); }}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-medium text-foreground">Rating
                          <select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={feedbackForm.rating} onChange={(event) => setFeedbackForm((current) => ({ ...current, rating: Number(event.target.value) }))}>
                            {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-medium text-foreground">Recommendation
                          <select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={feedbackForm.recommendation} onChange={(event) => setFeedbackForm((current) => ({ ...current, recommendation: event.target.value as InterviewRecommendation }))}>
                            <option value="strong_no">Strong no</option><option value="no">No</option><option value="neutral">Neutral</option><option value="yes">Yes</option><option value="strong_yes">Strong yes</option>
                          </select>
                        </label>
                      </div>
                      <label className="block text-xs font-medium text-foreground">Strengths
                        <textarea required minLength={2} maxLength={5000} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm" value={feedbackForm.strengths} onChange={(event) => setFeedbackForm((current) => ({ ...current, strengths: event.target.value }))} />
                      </label>
                      <label className="block text-xs font-medium text-foreground">Concerns
                        <textarea maxLength={5000} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm" value={feedbackForm.concerns} onChange={(event) => setFeedbackForm((current) => ({ ...current, concerns: event.target.value }))} />
                      </label>
                      <label className="block text-xs font-medium text-foreground">Private notes
                        <textarea maxLength={10000} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm" value={feedbackForm.notes} onChange={(event) => setFeedbackForm((current) => ({ ...current, notes: event.target.value }))} />
                      </label>
                      <Button type="submit" size="sm" loading={feedbackMut.isPending}>{myFeedback ? "Update my feedback" : "Save my feedback"}</Button>
                    </form>
                  ) : null}
                  <div className="space-y-2">
                    {(feedbackQ.data ?? []).map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                        <div className="flex justify-between gap-3"><strong>{entry.reviewer_name}</strong><span>{entry.rating}/5 · {entry.recommendation.replace(/_/g, " ")}</span></div>
                        <p className="mt-2 text-foreground-secondary"><strong>Strengths:</strong> {entry.strengths}</p>
                        {entry.concerns ? <p className="mt-1 text-foreground-secondary"><strong>Concerns:</strong> {entry.concerns}</p> : null}
                      </div>
                    ))}
                    {feedbackQ.data?.length === 0 ? <p className="text-sm text-muted-foreground">No interviewer feedback yet.</p> : null}
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Schedule an interview before recording structured feedback.</p>,
            },
            {
              id: "skills",
              label: "Skills",
              content: (
                <section className="candidate-profile-skills" aria-labelledby="candidate-skills-title">
                  <div className="candidate-profile-skills-heading">
                    <span className="candidate-section-icon" aria-hidden="true"><FiAward /></span>
                    <div className="candidate-section-heading-copy">
                      <h3 id="candidate-skills-title">Skills & expertise</h3>
                      <p>Candidate-reported strengths</p>
                    </div>
                    {skills.length ? (
                      <span className="candidate-section-count candidate-skills-count" aria-label={`${skills.length} skills`}>
                        <strong>{skills.length}</strong>
                        <span>skills</span>
                      </span>
                    ) : null}
                  </div>
                  {skills.length ? (
                    <ul className={`candidate-profile-skills-list${skills.length >= 3 ? " candidate-profile-skills-list-three" : ""}`}>
                      {skills.map((skill, index) => (
                        <li key={`${skill}-${index}`}>
                          {skill}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="candidate-profile-skills-empty">
                      <p>No skills shared yet</p>
                      <p>This candidate has not added skills to their profile.</p>
                    </div>
                  )}
                </section>
              ),
            },
            {
              id: "screening",
              label: "Screening",
              content: (
                <div
                  className={`candidate-screening-stack${screeningNeedsWideLayout ? " candidate-screening-stack-wide" : ""}`}
                >
                  <section className="candidate-screening" aria-labelledby="candidate-screening-title">
                    <div className="candidate-screening-heading">
                      <div className="candidate-screening-heading-main">
                        <span className="candidate-section-icon" aria-hidden="true"><FiActivity /></span>
                        <div className="candidate-section-heading-copy">
                          <h3 id="candidate-screening-title">AI screening</h3>
                          <p>AI-generated application review</p>
                        </div>
                      </div>
                      <div className="candidate-screening-score">
                        <AiScore app={app} />
                      </div>
                    </div>
                    {app.ai_status === "failed" ? (
                      <div className="candidate-screening-state">
                        <p>Screening did not complete. Retry runs it again.</p>
                        {canMoveStage ? (
                          <Button size="sm" variant="outline" loading={screenMut.isPending} onClick={() => screenMut.mutate()}>
                            Retry screening
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {screening ? (
                      <div className="candidate-screening-report">
                        <div className="candidate-screening-summary">
                          <div>
                            <span>Screening summary</span>
                            <p>{screening.summary}</p>
                          </div>
                        </div>
                        {screening.strengths.length > 0 ? (
                          <section className="candidate-screening-findings" aria-label="AI screening strengths">
                            <h4><FiCheckCircle aria-hidden="true" /> Strengths</h4>
                            <ul>{screening.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul>
                          </section>
                        ) : null}
                        {screening.gaps.length > 0 ? (
                          <section className="candidate-screening-findings candidate-screening-gaps" aria-label="AI screening gaps">
                            <h4><FiAlertCircle aria-hidden="true" /> Gaps</h4>
                            <ul>{screening.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
                          </section>
                        ) : null}
                      </div>
                    ) : app.ai_status !== "failed" ? (
                      <div className="candidate-screening-state">
                        <p>{app.ai_status === "processing" ? "Screening is running." : "Screening has not run yet."}</p>
                      </div>
                    ) : null}
                  </section>
                </div>
              ),
            },
            {
              id: "resume",
              label: "Resume",
              content: (
                <section className="candidate-resume" aria-label="Candidate resume">
                  <div className="candidate-resume-heading">
                    <span className="candidate-section-icon" aria-hidden="true"><FiFileText /></span>
                    <div className="candidate-section-heading-copy">
                      <h3>Resume</h3>
                    </div>
                    <span className="candidate-section-count">{cvHref ? "Attached" : "Missing"}</span>
                  </div>
                  {cvHref ? (
                    <>
                      <div className="candidate-resume-file">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z" strokeLinejoin="round" />
                          <path d="M14 3v5h5M8 12h8M8 16h5" strokeLinecap="round" />
                        </svg>
                        <div>
                          <p className="company-detail-label">Attached document</p>
                          <p className="candidate-resume-filename">{cvFilename || "Candidate CV"}</p>
                        </div>
                      </div>
                      <div className="candidate-resume-actions">
                        <a href={cvHref} target="_blank" rel="noreferrer noopener" className="candidate-resume-open">
                          <FiExternalLink aria-hidden="true" /> Open CV <span className="sr-only">in a new tab</span>
                        </a>
                        <a href={cvHref} download={cvFilename ?? true} className="candidate-resume-download">
                          <FiDownload aria-hidden="true" /> Download
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="candidate-resume-empty">
                      <p>No CV attached</p>
                      <p>No resume is available for this application.</p>
                    </div>
                  )}
                </section>
              ),
            },
            {
              id: "messages",
              label: "Messages",
              content: (
                <section className="candidate-messages" aria-label="Recruitment messages">
                  <div className="candidate-messages-heading">
                    <span className="candidate-section-icon" aria-hidden="true"><FiMessageSquare /></span>
                    <div className="candidate-section-heading-copy">
                      <h3>Messages</h3>
                    </div>
                    <span className={chatUnlocked ? "candidate-messages-status candidate-messages-available" : "candidate-messages-status"}>
                      {chatUnlocked ? "Available" : "Locked"}
                    </span>
                  </div>
                  <div className="candidate-messages-body">
                    <div className="candidate-messages-person">
                      <Avatar name={candidateName(app)} size="md" src={c?.avatar_url} />
                      <div>
                        <p>{candidateName(app)}</p>
                        <p>{jobTitle}</p>
                      </div>
                    </div>
                    <p className="candidate-messages-description">
                      {chatUnlocked
                        ? "Continue the conversation and coordinate next steps with this candidate."
                        : "Chat opens after the candidate moves to the next stage."}
                    </p>
                    {chatUnlocked ? (
                      <a href={`/chat/recruitment/${app.id}`} className="candidate-messages-link">
                        <FiMessageSquare aria-hidden="true" /> Open chat <span className="sr-only">with {candidateName(app)}</span>
                      </a>
                    ) : null}
                  </div>
                </section>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

export { jobTitleFor };
