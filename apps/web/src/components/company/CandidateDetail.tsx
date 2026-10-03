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
import { FiArrowRight, FiBarChart2, FiCheck, FiFileText, FiGitBranch, FiMessageSquare, FiX } from "react-icons/fi";

const PIPELINE_STAGES = [
  { status: "under_review", label: "Review", description: "Start structured screening" },
  { status: "shortlisted", label: "Shortlist", description: "Keep in active consideration" },
  { status: "interview", label: "Interview", description: "Move to a live conversation" },
  { status: "accepted", label: "Hire", description: "Mark the candidate as hired" },
] as const;

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
    <div className="company-candidate-detail">
      {canMoveStage && (
        <section
          className="company-candidate-stage-actions"
          aria-labelledby="candidate-stage-actions-title"
          aria-busy={stagePending}
        >
          <div className="company-candidate-stage-actions-heading">
            <span className="company-candidate-stage-actions-icon" aria-hidden="true">
              <FiGitBranch />
            </span>
            <div className="company-candidate-stage-actions-copy">
              <p className="company-detail-label">Application workflow</p>
              <h3 id="candidate-stage-actions-title">Choose the next stage</h3>
              <p>Move the candidate forward when your team is ready.</p>
            </div>
            <div className="company-candidate-stage-current">
              <span>Current stage</span>
              <StatusBadge status={app.status} size="sm" />
            </div>
          </div>
          <div className="company-candidate-stage-actions-controls">
            {PIPELINE_STAGES.map((stage, index) => {
              const active = app.status === stage.status;
              return (
                <button
                  key={stage.status}
                  type="button"
                  className={`company-candidate-stage-option${active ? " company-candidate-stage-option-active" : ""}`}
                  disabled={stagePending || active}
                  aria-current={active ? "step" : undefined}
                  onClick={() => onStage(stage.status)}
                >
                  <span className="company-candidate-stage-option-marker" aria-hidden="true">
                    {active ? <FiCheck /> : index + 1}
                  </span>
                  <span className="company-candidate-stage-option-copy">
                    <strong>{stage.label}</strong>
                    <small>{active ? "Candidate is here now" : stage.description}</small>
                  </span>
                  <FiArrowRight className="company-candidate-stage-option-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="company-candidate-stage-actions-footer">
            <div>
              <p>{stagePending ? "Updating pipeline…" : "Not moving forward?"}</p>
              <span>Rejecting keeps the application in the record.</span>
            </div>
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
              app.status !== "rejected" && (
                <Button size="sm" variant="ghost" className="company-candidate-reject-trigger" onClick={() => setRejectConfirm(true)}>
                  <FiX aria-hidden="true" /> Reject application
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
                  <section className="company-candidate-stage-card" aria-label="Hiring stage">
                    <div>
                      <p className="company-detail-label">Hiring stage</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Current application status</p>
                    </div>
                    <StatusBadge status={app.status} size="md" />
                  </section>

                  <dl className="company-candidate-detail-grid">
                    <div>
                      <dt className="company-detail-label">Applied</dt>
                      <dd>{dateTime(app.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="company-detail-label">Last update</dt>
                      <dd>{dateTime(app.updated_at)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="company-detail-label">Email</dt>
                      <dd>{c?.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "Not shared"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="company-detail-label">Job</dt>
                      <dd>{jobTitle}</dd>
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
              id: "skills",
              label: "Skills",
              content: (
                <section className="candidate-profile-skills" aria-label="Candidate skills">
                  <div className="candidate-profile-skills-heading">
                    <h3>Skills & expertise</h3>
                    <p>Skills shared on the candidate’s profile.</p>
                  </div>
                  {skills.length ? (
                    <ul className="candidate-profile-skills-list">
                      {skills.map((skill, index) => <li key={`${skill}-${index}`}>{skill}</li>)}
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
              id: "assessments",
              label: "Assessments",
              content: (
                <div className="space-y-4">
                  <div className="candidate-screening">
                  <div className="candidate-screening-heading">
                    <div>
                      <h3>AI screening</h3>
                      <p>AI-generated application review</p>
                    </div>
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
                    <div className="candidate-screening-report">
                      <p className="candidate-screening-summary">{screening.summary}</p>
                      {screening.strengths.length > 0 ? (
                        <section className="candidate-screening-findings" aria-label="AI screening strengths">
                          <h4>Strengths</h4>
                          <ul>{screening.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul>
                        </section>
                      ) : null}
                      {screening.gaps.length > 0 ? (
                        <section className="candidate-screening-findings candidate-screening-gaps" aria-label="AI screening gaps">
                          <h4>Gaps</h4>
                          <ul>{screening.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {app.ai_status === "processing" ? "Screening is running." : "Screening has not run yet."}
                    </p>
                  )}
                </div>
                  {assessment ? (
                    <section className="candidate-assessment-detail" aria-label="Practical assessment result">
                      <header className="candidate-assessment-header">
                        <div className="candidate-assessment-heading">
                          <span className="candidate-assessment-icon" aria-hidden="true"><FiFileText /></span>
                          <div>
                            <p className="company-detail-label">Practical assessment</p>
                            <h3>{assessment.title || "Assessment result"}</h3>
                          </div>
                        </div>
                        <div className="candidate-assessment-outcome">
                          <div className="candidate-assessment-score">
                            <span>Objective score</span>
                            <p>
                              <strong>{typeof assessment.score === "number" ? assessment.score : "—"}</strong>
                              <span>/ 100</span>
                            </p>
                          </div>
                          <div className="candidate-assessment-status">
                            <span>Status</span>
                            <StatusBadge status={assessment.status} size="sm" />
                          </div>
                        </div>
                      </header>
                      <div className="candidate-assessment-reports">
                        {assessment.report ? (
                          <section className="candidate-assessment-report candidate-assessment-report-analysis" aria-label="AI analysis">
                            <span className="candidate-assessment-report-icon" aria-hidden="true"><FiBarChart2 /></span>
                            <div>
                              <h4>AI analysis</h4>
                              <p>{assessment.report}</p>
                            </div>
                          </section>
                        ) : null}
                        {app.ai_report ? (
                          <section className="candidate-assessment-report candidate-assessment-report-note" aria-label="Application AI note">
                            <span className="candidate-assessment-report-icon" aria-hidden="true"><FiMessageSquare /></span>
                            <div>
                              <h4>Application AI note</h4>
                              <p>{app.ai_report}</p>
                            </div>
                          </section>
                        ) : null}
                        {!assessment.report && !app.ai_report ? (
                          <p className="candidate-assessment-empty">No AI notes recorded for this assessment.</p>
                        ) : null}
                      </div>
                    </section>
                  ) : (
                <section className="candidate-assessment-notice" aria-label="Practical assessment">
                  <h3>Practical assessment</h3>
                  <p>No practical assessment registered for this application.</p>
                </section>
              )}
                </div>
              ),
            },
            {
              id: "resume",
              label: "Resume",
              content: (
                <section className="candidate-resume" aria-label="Candidate resume">
                  <div className="candidate-resume-heading">
                    <h3>Resume</h3>
                    <p>The CV attached to this application.</p>
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
                        <a href={cvHref} target="_blank" rel="noreferrer noopener" className="candidate-resume-open">Open CV <span className="sr-only">in a new tab</span></a>
                        <a href={cvHref} download={cvFilename ?? true} className="candidate-resume-download">Download</a>
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
                    <div>
                      <h3>Messages</h3>
                      <p>Recruitment conversation for this application.</p>
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
                        Open chat <span className="sr-only">with {candidateName(app)}</span>
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
