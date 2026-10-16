"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiAward, FiCheckCircle, FiTarget } from "react-icons/fi";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { getMissionProgress, listMissions, submitMissionAttempt } from "@/lib/api";

export default function MissionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [field, setField] = useState("");
  const [level, setLevel] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const missions = useQuery({
    queryKey: ["practice-missions", field.trim(), level],
    queryFn: () => listMissions({ field: field.trim() || undefined, level: level || undefined }),
  });
  const progress = useQuery({ queryKey: ["mission-progress"], queryFn: getMissionProgress });
  const submit = useMutation({
    mutationFn: ({ missionId, evidence }: { missionId: string; evidence: string }) => submitMissionAttempt(missionId, evidence),
    onSuccess: (attempt) => {
      setDrafts((current) => ({ ...current, [attempt.mission_id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["practice-missions"] });
      void queryClient.invalidateQueries({ queryKey: ["mission-progress"] });
      toast("Attempt submitted for review", { variant: "success" });
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Attempt could not be submitted.";
      toast("Submission failed", { description: String(message), variant: "error" });
    },
  });

  return (
    <PageContainer>
      <div className="space-y-6 py-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Evidence-backed learning</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Practice missions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Submit evidence for field-based missions. Skills and scores appear on your profile only after an administrator validates them.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Mission progress">
          <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Attempts</p><p className="mt-1 text-2xl font-bold">{progress.data?.attempted ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Validated</p><p className="mt-1 text-2xl font-bold">{progress.data?.completed ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Average score</p><p className="mt-1 text-2xl font-bold">{progress.data?.average_score ?? "—"}</p></div>
        </section>

        {(progress.data?.validated_skills.length ?? 0) > 0 ? (
          <section className="rounded-2xl border border-success/30 bg-success/10 p-4">
            <div className="flex items-center gap-2"><FiCheckCircle aria-hidden className="text-success" /><h2 className="font-bold text-foreground">Validated skills</h2></div>
            <div className="mt-3 flex flex-wrap gap-2">{progress.data?.validated_skills.map((skill) => <span key={skill} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground">{skill}</span>)}</div>
          </section>
        ) : null}

        <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
          <Input label="Field" type="search" value={field} onChange={(event) => setField(event.target.value)} placeholder="e.g. Software engineering" />
          <Select label="Level" value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </section>

        {missions.isLoading ? <p className="text-sm text-muted-foreground">Loading missions…</p> : null}
        {missions.isError ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4 text-sm text-danger">Missions could not be loaded.</p> : null}
        {missions.data?.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">No active missions match these filters.</p> : null}

        <div className="space-y-4">
          {(missions.data ?? []).map((mission) => {
            const latest = mission.latest_attempt;
            const evidence = drafts[mission.id] ?? "";
            const awaitingReview = latest?.status === "submitted";
            const attemptsExhausted = (latest?.attempt_number ?? 0) >= 5;
            return (
              <article key={mission.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><FiTarget aria-hidden />{mission.field} · {mission.level}</div>
                    <h2 className="mt-2 text-xl font-bold text-foreground">{mission.title}</h2>
                  </div>
                  {latest ? <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-semibold text-foreground-secondary">Attempt {latest.attempt_number}/5 · {latest.status}</span> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground-secondary">{mission.description}</p>
                <div className="mt-4 rounded-xl bg-surface-secondary/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Evidence requested</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-secondary">{mission.evidence_prompt}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{mission.skills.map((skill) => <span key={skill} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-foreground">{skill}</span>)}</div>
                </div>
                {latest?.feedback ? <p className="mt-4 rounded-xl border border-border-subtle p-3 text-sm text-foreground-secondary"><strong>Reviewer feedback:</strong> {latest.feedback}</p> : null}
                {typeof latest?.score === "number" ? <p className="mt-2 text-sm font-semibold text-primary"><FiAward aria-hidden className="mr-1 inline" />Score: {latest.score}/100</p> : null}
                {!awaitingReview && !attemptsExhausted ? (
                  <div className="mt-4">
                    <Textarea
                      label="Your evidence"
                      value={evidence}
                      onChange={(event) => setDrafts((current) => ({ ...current, [mission.id]: event.target.value }))}
                      maxLength={20_000}
                      showCount
                      rows={7}
                      helper="Describe the result, your process, and links or excerpts that a reviewer can verify. Submitted text is never executed."
                    />
                    <div className="mt-3 flex justify-end"><Button disabled={evidence.trim().length < 20} loading={submit.isPending} onClick={() => submit.mutate({ missionId: mission.id, evidence })}>Submit attempt</Button></div>
                  </div>
                ) : awaitingReview ? (
                  <p className="mt-4 rounded-xl bg-warning-background p-3 text-sm text-foreground-secondary">This attempt is awaiting review. A new attempt becomes available after a reviewer validates or rejects it.</p>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Maximum of five attempts reached.</p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
