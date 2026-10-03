"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Drawer } from "@/components/company/Drawer";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { createAssessment, getApplications, getAssessments, getMe, reviewAssessment } from "@/lib/api";
import { can } from "@/lib/permissions";
import { candidateName } from "@/components/company/hiring";
import type { ApplicationItem, AssessmentItem } from "@/lib/types";
import { FiAward, FiCheckCircle, FiFileText, FiSearch } from "react-icons/fi";

export default function AssessmentsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canEvaluate = can(me ?? null, "evaluate_candidates");
  const { data: assData, isLoading, isError, refetch } = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments as AssessmentItem[],
  });
  const appsQ = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications as ApplicationItem[],
    enabled: !!me,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<AssessmentItem | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rubric, setRubric] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reviewScore, setReviewScore] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");

  const createMut = useMutation({
    mutationFn: () => createAssessment({
      application_id: applicationId,
      title,
      description,
      rubric: rubric.split("\n").map((item) => item.trim()).filter(Boolean),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    }),
    onSuccess: () => {
      setAssignmentOpen(false);
      setApplicationId("");
      setTitle("");
      setDescription("");
      setRubric("");
      setDueAt("");
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
  const reviewMut = useMutation({
    mutationFn: () => reviewAssessment(selected!.id, {
      expected_version: selected!.version,
      score: Number(reviewScore),
      feedback: reviewFeedback,
    }),
    onSuccess: (item) => {
      setSelected(item);
      setReviewScore("");
      setReviewFeedback("");
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
  });

  const assessments = assData ?? [];
  const appsByCandidate = useMemo(() => {
    const m = new Map<string, ApplicationItem>();
    (appsQ.data ?? []).forEach((a) => {
      if (a.candidate_id && !m.has(a.candidate_id)) m.set(a.candidate_id, a);
      if (a.id && !m.has(a.id)) m.set(a.id, a);
    });
    return m;
  }, [appsQ.data]);

  const nameFor = (a: AssessmentItem): string => {
    const fromCandidate = a.candidate_id ? appsByCandidate.get(a.candidate_id) : undefined;
    if (fromCandidate) return candidateName(fromCandidate);
    const fromApp = a.application_id ? appsByCandidate.get(a.application_id) : undefined;
    if (fromApp) return candidateName(fromApp);
    if (a.candidate?.full_name) return a.candidate.full_name;
    return "Candidate";
  };

  const filtered = useMemo(() => {
    let list = assessments;
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) => (a.title ?? "").toLowerCase().includes(q) || a.status.toLowerCase().includes(q) || nameFor(a).toLowerCase().includes(q)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessments, statusFilter, search, appsQ.data]);

  const completedCount = assessments.filter((a) => a.status === "graded" || a.status === "reviewed").length;
  const pendingCount = assessments.filter((a) => ["assigned", "submitted", "grading"].includes(a.status)).length;
  const scored = assessments.filter((a) => typeof a.score === "number");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          tone="dark"
          title="Assessments"
          subtitle="Practical evaluations linked to applications. Scores shown as recorded."
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{assessments.length} total</span>}
          actions={canEvaluate ? <Button size="sm" onClick={() => setAssignmentOpen((open) => !open)}>Assign assessment</Button> : undefined}
        />

        {assignmentOpen ? (
          <section className="rounded-xl border border-border-subtle bg-surface p-4" aria-label="Assign assessment">
            <h2 className="text-sm font-bold text-foreground">Assign a practical task</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={applicationId} onChange={(event) => setApplicationId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" aria-label="Application">
                <option value="">Select candidate application</option>
                {(appsQ.data ?? []).filter((app) => !["applied", "accepted", "rejected"].includes(app.status)).map((app) => <option key={app.id} value={app.id}>{candidateName(app)}</option>)}
              </select>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Assessment title" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" aria-label="Due date" />
              <textarea value={rubric} onChange={(event) => setRubric(event.target.value)} rows={4} placeholder="Rubric criteria — one per line" className="rounded-lg border border-border bg-background p-3 text-sm" />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={10_000} placeholder="Task instructions" className="rounded-lg border border-border bg-background p-3 text-sm sm:col-span-2" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAssignmentOpen(false)}>Cancel</Button>
              <Button size="sm" loading={createMut.isPending} disabled={!applicationId || title.trim().length < 2 || description.trim().length < 10 || rubric.trim().length < 1} onClick={() => createMut.mutate()}>Assign task</Button>
            </div>
            {createMut.isError ? <p role="alert" className="mt-2 text-sm text-danger">The assessment could not be assigned.</p> : null}
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total" value={assessments.length} subValue="Company-scoped evaluations" icon={FiFileText} />
          <StatCard label="Completed" value={completedCount} subValue={`${pendingCount} awaiting completion`} icon={FiCheckCircle} />
          <StatCard label="Scored" value={scored.length} subValue={scored.length ? "Results recorded" : "No scores yet"} icon={FiAward} />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="assess-search" className="sr-only">Search assessments</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="assess-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, candidate, status"
              className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="submitted">Submitted</option>
            <option value="grading">Grading</option>
            <option value="graded">AI graded</option>
            <option value="reviewed">HR reviewed</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load assessments.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiFileText}
            title={assessments.length === 0 ? "No assessments yet" : "No assessments match filters"}
            description={assessments.length === 0 ? "Submissions appear here when candidates take practical tests." : "Clear search or change status filter."}
            primaryAction={assessments.length !== 0 ? { label: "Clear filters", onClick: () => { setSearch(""); setStatusFilter("all"); } } : undefined}
          />
        ) : (
          <ul className="space-y-2" aria-label="Assessments">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  aria-label={`Open assessment for ${nameFor(a)}, status ${a.status}`}
                  className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-border-strong"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-muted-foreground">
                    <FiFileText aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{a.title || "Practical assessment"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{nameFor(a)}</span>
                  </span>
                  <StatusBadge status={a.status} size="sm" />
                  <span className="text-xs font-semibold text-foreground">
                    {typeof a.score === "number" ? `Score ${a.score}` : <span className="font-normal text-muted-foreground">Pending</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Drawer
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.title || "Practical assessment"}
          subtitle={selected ? `Candidate: ${nameFor(selected)} · Status: ${selected.status.replace(/_/g, " ")}` : undefined}
          width="md"
        >
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-surface-secondary/50 p-3">
                <span className="text-xs font-semibold text-foreground">Objective score</span>
                <span className="text-sm font-bold text-foreground">
                  {typeof selected.score === "number" ? selected.score : "Pending evaluation"}
                </span>
              </div>
              {selected.description && (
                <section aria-label="Test description">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Test description</h4>
                  <p className="mt-1 rounded-lg border border-border-subtle p-3 text-[13px] leading-relaxed text-foreground-secondary">{selected.description}</p>
                </section>
              )}
              {selected.report ? (
                <section aria-label="AI analysis" className="rounded-lg bg-surface-secondary/50 p-3">
                  <h4 className="text-xs font-semibold text-foreground">AI analysis</h4>
                  <p className="mt-1 text-[13px] leading-relaxed text-foreground-secondary">{selected.report}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">AI interpretation, separate from objective score above.</p>
                </section>
              ) : (
                <p className="text-[13px] text-muted-foreground">No AI analysis recorded.</p>
              )}
              {selected.feedback ? (
                <section aria-label="HR feedback" className="rounded-lg border border-border-subtle p-3">
                  <h4 className="text-xs font-semibold text-foreground">HR feedback</h4>
                  <p className="mt-1 text-[13px] text-foreground-secondary">{selected.feedback}</p>
                </section>
              ) : null}
              {canEvaluate && (["graded", "reviewed"].includes(selected.status) || (selected.status === "submitted" && selected.grading_status === "failed")) ? (
                <section aria-label="Review assessment" className="rounded-lg border border-border-subtle p-3">
                  <h4 className="text-xs font-semibold text-foreground">Review or override result</h4>
                  <div className="mt-2 space-y-2">
                    <input type="number" min={0} max={selected.max_score} value={reviewScore} onChange={(event) => setReviewScore(event.target.value)} placeholder={`Score out of ${selected.max_score}`} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                    <textarea rows={4} maxLength={5_000} value={reviewFeedback} onChange={(event) => setReviewFeedback(event.target.value)} placeholder="Evidence-based feedback" className="w-full rounded-lg border border-border bg-background p-3 text-sm" />
                    <Button size="sm" loading={reviewMut.isPending} disabled={reviewScore === "" || Number(reviewScore) < 0 || Number(reviewScore) > selected.max_score || reviewFeedback.trim().length < 2} onClick={() => reviewMut.mutate()}>Save reviewed result</Button>
                    {reviewMut.isError ? <p role="alert" className="text-xs text-danger">Review could not be saved; refresh if another reviewer changed it.</p> : null}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </Drawer>
      </div>
    </AppShell>
  );
}
