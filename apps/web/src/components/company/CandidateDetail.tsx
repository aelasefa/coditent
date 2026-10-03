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
import {
  FiActivity,
  FiAward,
  FiBarChart2,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiGitBranch,
  FiMessageSquare,
  FiX,
} from "react-icons/fi";

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
              {!PIPELINE_STAGES.some((stage) => stage.status === app.status) && (
                <option value={app.status} disabled>
                  {app.status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </option>
              )}
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage.status} value={stage.status} title={stage.description}>{stage.label}</option>
              ))}
            </select>
            <p id="candidate-stage-save-status" role="status" className="sr-only">
              {stagePending ? "Updating pipeline…" : "Stage changes save automatically."}
            </p>
          </div>
          <div className="company-candidate-stage-secondary">
            {rejectConfirm && app.status !== "rejected" ? (
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
                    <ul className="candidate-profile-skills-list">
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
              id: "assessments",
              label: "Assessments",
              content: (
                <div className="candidate-assessments-stack">
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
                    ) : app.ai_status !== "failed" ? (
                      <div className="candidate-screening-state">
                        <p>{app.ai_status === "processing" ? "Screening is running." : "Screening has not run yet."}</p>
                      </div>
                    ) : null}
                  </section>
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
                            <span className="sr-only">Status</span>
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
                        {!assessment.report ? (
                          <p className="candidate-assessment-empty">No AI analysis recorded for this assessment.</p>
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
