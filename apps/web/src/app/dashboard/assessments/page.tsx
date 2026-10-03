"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { getAssessments, submitAssessment } from "@/lib/api";
import type { AssessmentItem } from "@/lib/types";

function dueLabel(value?: string | null): string {
  if (!value) return "No deadline";
  return new Date(value).toLocaleString();
}

export default function CandidateAssessmentsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const assessments = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments,
  });
  const submit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => submitAssessment(id, text),
    onSuccess: (item) => {
      setDrafts((current) => ({ ...current, [item.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
  });

  return (
    <PageContainer>
      <div className="space-y-6 py-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Practical evaluation</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Assessments</h1>
          <p className="mt-2 text-sm text-muted-foreground">Complete assigned tasks before their deadline. AI grading is a draft until HR reviews it.</p>
        </header>

        {assessments.isLoading ? <p className="text-sm text-muted-foreground">Loading assessments…</p> : null}
        {assessments.isError ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4 text-sm text-danger">Assessments could not be loaded.</p> : null}
        {assessments.data?.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">No assessments are assigned to you.</p> : null}

        <div className="space-y-4">
          {(assessments.data ?? []).map((item: AssessmentItem) => {
            const canSubmit = item.status === "assigned";
            const text = drafts[item.id] ?? "";
            return (
              <article key={item.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{item.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Due: {dueLabel(item.due_at)} · Status: {item.status.replace(/_/g, " ")}</p>
                  </div>
                  {typeof item.score === "number" ? <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{item.score}/{item.max_score}</span> : null}
                </div>
                {item.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground-secondary">{item.description}</p> : null}
                <section className="mt-4 rounded-xl bg-surface-secondary/60 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rubric</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                    {item.rubric.map((criterion) => <li key={criterion}>{criterion}</li>)}
                  </ul>
                </section>
                {canSubmit ? (
                  <div className="mt-4">
                    <label htmlFor={`submission-${item.id}`} className="text-sm font-semibold text-foreground">Your submission</label>
                    <textarea
                      id={`submission-${item.id}`}
                      value={text}
                      maxLength={20_000}
                      rows={8}
                      onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Explain your solution and include relevant evidence. Submitted code is reviewed as text and is not executed."
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">{text.length}/20,000 characters</span>
                      <Button disabled={text.trim().length < 20} loading={submit.isPending} onClick={() => submit.mutate({ id: item.id, text })}>Submit assessment</Button>
                    </div>
                    {submit.isError ? <p role="alert" className="mt-2 text-sm text-danger">Submission failed. Check the deadline and try again.</p> : null}
                  </div>
                ) : null}
                {item.report ? <p className="mt-4 rounded-xl border border-border-subtle p-3 text-sm text-foreground-secondary"><strong>AI draft:</strong> {item.report}</p> : null}
                {item.feedback ? <p className="mt-3 rounded-xl bg-success/10 p-3 text-sm text-foreground-secondary"><strong>HR feedback:</strong> {item.feedback}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
