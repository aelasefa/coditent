"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getProfile } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MatchScore, getMatchState } from "./match-score";
import { formatDate, formatSalary, offerLocation, parseSkills } from "./offer-utils";
import type { Recommendation } from "@/lib/types";

interface JobDetailsProps {
  rec: Recommendation;
  applied: boolean;
  onApplied: (offerId: string) => void;
}

export function JobDetails({ rec, applied, onApplied }: JobDetailsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const offer = rec.offer;
  const score = rec.score ?? rec.ai_score ?? null;
  const reasoning = rec.reasoning ?? rec.ai_reasoning ?? null;
  const matchState = getMatchState(score, reasoning);
  const skills = parseSkills(offer.required_skills);
  const location = offerLocation(offer);
  const posted = formatDate(offer.posted_at);
  const salary = formatSalary(offer.salary_min, offer.salary_max);

  async function handleApply() {
    if (applied || pending || !offer.active) return;
    setPending(true);
    try {
      let cvUrl: string | undefined;
      try {
        const profile = (await getProfile()) as { cv_url?: string | null };
        cvUrl = profile?.cv_url || undefined;
      } catch {
        cvUrl = undefined;
      }
      await api.post("/applications", { opportunity_id: offer.id, cv_url: cvUrl });
      onApplied(offer.id);
      toast("Application submitted", { description: `${offer.title} at ${offer.company}`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: unknown } }; message?: string };
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((x: { msg?: string }) => x.msg).join("; ")
        : typeof detail === "string"
          ? detail
          : err?.message || "Application failed";
      if (msg.toLowerCase().includes("already applied")) {
        onApplied(offer.id);
        toast("Already applied", { description: "This application already exists.", variant: "info" });
      } else {
        toast("Application failed", { description: msg, variant: "error" });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <Avatar name={offer.company} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight text-foreground">{offer.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{offer.company}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {[location, offer.type === "INTERNSHIP" ? "Internship" : "Job", offer.work_mode, offer.field]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[posted ? `Posted ${posted}` : null, salary, !offer.active ? "Closed" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MatchScore score={score} reasoning={reasoning} />
        {offer.required_experience ? (
          <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-foreground-secondary">
            {offer.required_experience}
          </span>
        ) : null}
        {offer.deadline ? (
          <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-foreground-secondary">
            Apply by {formatDate(offer.deadline) ?? offer.deadline}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        {applied ? (
          <Button variant="secondary" disabled aria-disabled>
            Applied
          </Button>
        ) : (
          <Button onClick={handleApply} loading={pending} disabled={!offer.active || pending}>
            {offer.active ? "Apply now" : "Closed"}
          </Button>
        )}
      </div>

      <section aria-label="About the role" className="mt-6">
        <h3 className="ct-section-title">About the role</h3>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground-secondary">
          {offer.description || "No description provided."}
        </p>
      </section>

      {offer.requirements ? (
        <section aria-label="Requirements" className="mt-6">
          <h3 className="ct-section-title">Requirements</h3>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground-secondary">
            {offer.requirements}
          </p>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section aria-label="Skills" className="mt-6">
          <h3 className="ct-section-title">Skills</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-foreground-secondary">
                {s}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Your match" className="mt-6 rounded-xl border border-border-subtle bg-surface-secondary/40 p-4">
        <h3 className="text-sm font-semibold text-foreground">
          <span aria-hidden>✦ </span>Your match <span className="ml-1 text-xs font-medium text-muted-foreground">AI analysis</span>
        </h3>
        {matchState === "scored" ? (
          <>
            <p className="mt-2 text-sm font-semibold text-primary">{score}% match</p>
            {reasoning ? <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{reasoning}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              AI interpretation based on job text and profile. Facts above come from job posting.
            </p>
          </>
        ) : matchState === "pending" ? (
          <p className="mt-2 text-sm text-muted-foreground">Match analysis in progress. Check back soon.</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">We could not generate a match analysis.</p>
        )}
      </section>
    </div>
  );
}

export function JobDetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading job details" className="space-y-3">
      <div className="h-7 w-2/3 animate-pulse rounded bg-surface-secondary" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-surface-secondary" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface-secondary" />
      <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-surface-secondary" />
    </div>
  );
}
