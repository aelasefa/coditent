"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { EmptyState } from "@/components/company/EmptyState";
import { StatCardsSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { getMe, getApplications, getAssessments, getApiBaseUrl } from "@/lib/api";
import type { ApplicationItem, AssessmentItem, Offer } from "@/lib/types";
import { FiBarChart2, FiBriefcase, FiFileText, FiUserCheck, FiUsers } from "react-icons/fi";

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
      <p className="text-sm font-semibold text-danger">Could not load this section.</p>
      <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">Retry</Button>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const offersQ = useQuery({
    queryKey: ["company-offers"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("coditent_token") : null;
      const r = await fetch(`${getApiBaseUrl()}/offers/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      }).then((x) => {
        if (!x.ok) throw new Error(`Jobs request failed: ${x.status}`);
        return x.json();
      });
      return (r.offers as Offer[]) || [];
    },
    enabled: !!me,
  });
  const appsQ = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications as ApplicationItem[],
    enabled: !!me,
  });
  const assQ = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments as AssessmentItem[],
    enabled: !!me,
  });

  const offers = offersQ.data ?? [];
  const apps = appsQ.data ?? [];
  const assessments = assQ.data ?? [];
  const byStatus = (s: string) => apps.filter((a) => a.status === s).length;

  const distribution = useMemo(
    () => [
      { key: "applied", label: "Applied", count: byStatus("applied") },
      { key: "under_review", label: "Screening", count: byStatus("under_review") },
      { key: "shortlisted", label: "Shortlisted", count: byStatus("shortlisted") },
      { key: "assessment", label: "Assessment", count: byStatus("assessment_required") + byStatus("assessment_completed") },
      { key: "interview", label: "Interview", count: byStatus("interview") },
      { key: "accepted", label: "Hired", count: byStatus("accepted") },
      { key: "rejected", label: "Rejected", count: byStatus("rejected") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apps]
  );

  const jobRows = useMemo(
    () =>
      offers.map((o) => {
        const forJob = apps.filter((a) => a.opportunity_id === o.id);
        const inStage = (s: string) => forJob.filter((a) => a.status === s).length;
        return {
          offer: o,
          total: forJob.length,
          screening: inStage("under_review"),
          assessment: inStage("assessment_required") + inStage("assessment_completed"),
          interview: inStage("interview"),
          hired: inStage("accepted"),
        };
      }),
    [offers, apps]
  );

  const scored = assessments.filter((a) => typeof a.score === "number");
  const loading = offersQ.isLoading || appsQ.isLoading;

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title="Insights"
          subtitle="Current hiring snapshot from live jobs, applications and assessments. No historical trends available yet."
        />

        <section aria-label="Snapshot">
          <h2 className="ct-section-title">Current snapshot</h2>
          {loading ? (
            <div className="mt-3"><StatCardsSkeleton /></div>
          ) : offersQ.isError || appsQ.isError || assQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => { offersQ.refetch(); appsQ.refetch(); assQ.refetch(); }} /></div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Open jobs" value={offers.filter((o) => o.active).length} subValue={`${offers.length} total roles`} icon={FiBriefcase} />
              <StatCard label="Total applications" value={apps.length} subValue={`${byStatus("applied")} awaiting review`} icon={FiUsers} />
              <StatCard label="Hired" value={byStatus("accepted")} subValue={`${byStatus("interview")} in interview`} icon={FiUserCheck} highlight />
              <StatCard label="Assessments scored" value={scored.length} subValue={`${assessments.length} evaluations total`} icon={FiFileText} />
            </div>
          )}
        </section>

        <section aria-label="Pipeline distribution">
          <h2 className="ct-section-title">Current pipeline distribution</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Where every application sits right now. Not a historical conversion funnel.</p>
          {appsQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => appsQ.refetch()} /></div>
          ) : apps.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={FiBarChart2} title="No pipeline data" description="Distribution appears once candidates apply." primaryAction={{ label: "View jobs", href: "/company/jobs" }} />
            </div>
          ) : (
            <div className="mt-3 space-y-3 rounded-xl border border-border-subtle bg-surface p-5">
              {distribution.map((s) => {
                const pct = apps.length > 0 ? Math.round((s.count / apps.length) * 100) : 0;
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground-secondary">{s.label}</span>
                      <span><strong className="text-foreground">{s.count}</strong> <span className="text-muted-foreground">({pct}% of current)</span></span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" aria-valuenow={s.count} aria-valuemin={0} aria-valuemax={apps.length} aria-label={`${s.label} share`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section aria-label="Job performance">
          <div className="flex items-center justify-between">
            <h2 className="ct-section-title">Job performance</h2>
            <Link href="/company/jobs" className="text-[13px] font-semibold text-primary hover:underline">Manage jobs</Link>
          </div>
          {offersQ.isError || appsQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => { offersQ.refetch(); appsQ.refetch(); }} /></div>
          ) : jobRows.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={FiBriefcase} title="No jobs to measure" description="Publish a role to track per-job pipeline." primaryAction={{ label: "Create job", href: "/company/jobs" }} />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {jobRows.map((row) => (
                <li key={row.offer.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                  <p className="truncate text-sm font-semibold text-foreground">{row.offer.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.offer.region} · {row.offer.active ? "Active" : "Paused"}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-5">
                    {[["Applications", row.total], ["Screening", row.screening], ["Assessment", row.assessment], ["Interview", row.interview], ["Hired", row.hired]].map(([k, v]) => (
                      <div key={k as string} className="rounded-lg bg-surface-secondary/50 px-2.5 py-1.5">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-bold text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Assessment coverage">
          <h2 className="ct-section-title">Assessment coverage</h2>
          {assQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => assQ.refetch()} /></div>
          ) : (
            <div className="mt-3 grid gap-2 rounded-xl border border-border-subtle bg-surface p-5 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Total evaluations</p><p className="text-xl font-bold text-foreground">{assessments.length}</p></div>
              <div><p className="text-muted-foreground">Completed or evaluated</p><p className="text-xl font-bold text-foreground">{assessments.filter((a) => a.status === "completed" || a.status === "evaluated").length}</p></div>
              <div><p className="text-muted-foreground">With recorded score</p><p className="text-xl font-bold text-foreground">{scored.length}</p></div>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Scores shown as recorded. Scale varies by assessment. Time-to-hire, trends and source attribution need event history not yet available.</p>
        </section>
      </div>
    </AppShell>
  );
}
