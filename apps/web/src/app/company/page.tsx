"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { StatCardsSkeleton } from "@/components/company/LoadingSkeleton";
import { getMe, getApplications, getAssessments, getAuditLogs, getCompany, getApiBaseUrl } from "@/lib/api";
import { candidateName, jobTitleFor } from "@/components/company/hiring";
import type { ApplicationItem, Offer } from "@/lib/types";
import { FiArrowRight, FiBriefcase, FiFileText, FiPlus, FiUserCheck, FiUsers } from "react-icons/fi";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
      <p className="text-sm font-semibold text-danger">Could not load this section.</p>
      <button type="button" onClick={onRetry} className="mt-1 text-sm font-semibold text-danger underline">
        Retry
      </button>
    </div>
  );
}

export default function CompanyDashboard() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: company } = useQuery({
    queryKey: ["company", me?.company_id],
    queryFn: () => (me?.company_id ? getCompany(me.company_id) : null),
    enabled: !!me?.company_id,
  });

  const offersQ = useQuery({
    queryKey: ["company-offers"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("coditent_token") : null;
      const r = await fetch(`${getApiBaseUrl()}/offers/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      }).then((x) => {
        if (!x.ok) throw new Error(`Offers request failed: ${x.status}`);
        return x.json();
      });
      return (r.offers || []) as Offer[];
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
    queryFn: async () => (await getAssessments()).assessments,
    enabled: !!me,
  });
  const auditQ = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await getAuditLogs()).logs,
    enabled: !!me,
  });

  const offers = offersQ.data ?? [];
  const apps = appsQ.data ?? [];
  const assessments = assQ.data ?? [];
  const auditLogs = (auditQ.data ?? []).slice(0, 5);
  const offersById = new Map(offers.map((o) => [o.id, o.title]));

  const activeOffers = offers.filter((o) => o.active).length;
  const byStatus = (s: string) => apps.filter((a) => a.status === s).length;
  const appliedPending = apps.filter((a) => a.status === "applied").slice(0, 3);
  const interviewNow = apps.filter((a) => a.status === "interview").slice(0, 2);
  const assessedPending = (assessments as Array<{ id: string; status: string }>).filter((a) => a.status === "pending").slice(0, 2);
  const attentionCount = appliedPending.length + interviewNow.length + assessedPending.length;
  const loading = offersQ.isLoading || appsQ.isLoading;

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title={`${greeting()}, ${me?.full_name?.split(" ")[0] || "Recruiter"}`}
          subtitle={`Welcome to the ${company?.name || "company"} workspace. What needs attention today.`}
          actions={
            <Link
              href="/company/jobs"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <FiPlus aria-hidden className="h-4 w-4" />
              <span>Create job</span>
            </Link>
          }
        />

        <section aria-label="Needs attention">
          <h2 className="ct-section-title">
            Needs attention {attentionCount > 0 ? `(${attentionCount})` : ""}
          </h2>
          {appsQ.isError || assQ.isError ? (
            <div className="mt-3">
              <SectionError onRetry={() => { appsQ.refetch(); assQ.refetch(); }} />
            </div>
          ) : appliedPending.length + interviewNow.length + assessedPending.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
              Nothing waiting. New applications, interviews and pending assessments appear here.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {appliedPending.map((a) => (
                <li key={a.id}>
                  <Link href="/company/candidates?status=applied" className="block rounded-xl border border-border-subtle bg-surface px-4 py-3 hover:border-border-strong">
                    <span className="block text-sm font-semibold text-foreground">Application awaiting review</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidateName(a)} · {jobTitleFor(a, offersById)}
                    </span>
                  </Link>
                </li>
              ))}
              {interviewNow.map((a) => (
                <li key={a.id}>
                  <Link href="/company/candidates?status=interview" className="block rounded-xl border border-border-subtle bg-surface px-4 py-3 hover:border-border-strong">
                    <span className="block text-sm font-semibold text-foreground">Interview stage active</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidateName(a)} · {jobTitleFor(a, offersById)}
                    </span>
                  </Link>
                </li>
              ))}
              {assessedPending.map((a) => (
                <li key={String(a.id)}>
                  <Link href="/company/assessments" className="block rounded-xl border border-border-subtle bg-surface px-4 py-3 hover:border-border-strong">
                    <span className="block text-sm font-semibold text-foreground">Assessment awaiting review</span>
                    <span className="block text-xs text-muted-foreground">Open assessments queue</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Hiring summary">
          <h2 className="ct-section-title">Hiring summary</h2>
          {loading ? (
            <div className="mt-3"><StatCardsSkeleton /></div>
          ) : offersQ.isError || appsQ.isError || assQ.isError ? (
            <div className="mt-3">
              <SectionError onRetry={() => { offersQ.refetch(); appsQ.refetch(); assQ.refetch(); }} />
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Open jobs" value={activeOffers} subValue={`${offers.length} total jobs`} icon={FiBriefcase} />
              <StatCard label="Awaiting review" value={byStatus("applied")} subValue={`${byStatus("under_review")} under review`} icon={FiUsers} />
              <StatCard label="In assessment" value={byStatus("assessment_required") + byStatus("assessment_completed")} subValue={`${byStatus("interview")} in interview`} icon={FiFileText} />
              <StatCard label="Hired" value={byStatus("accepted")} subValue={`${byStatus("shortlisted")} shortlisted`} icon={FiUserCheck} highlight />
            </div>
          )}
        </section>

        <section aria-label="Pipeline">
          <div className="flex items-center justify-between">
            <h2 className="ct-section-title">Pipeline</h2>
            <Link href="/company/candidates" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
              Open ATS <FiArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
          {appsQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => appsQ.refetch()} /></div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { key: "applied", label: "Applied" },
                { key: "under_review", label: "Screening" },
                { key: "shortlisted", label: "Shortlisted" },
                { key: "assessment", label: "Assessment" },
                { key: "interview", label: "Interview" },
                { key: "accepted", label: "Hired" },
              ].map((s) => {
                const count =
                  s.key === "assessment"
                    ? byStatus("assessment_required") + byStatus("assessment_completed")
                    : byStatus(s.key);
                return (
                  <Link
                    key={s.key}
                    href={`/company/candidates?status=${s.key === "assessment" ? "assessment_required" : s.key}`}
                    className="rounded-xl border border-border-subtle bg-surface p-3.5 text-center hover:border-border-strong"
                  >
                    <span className="block text-2xl font-bold text-foreground">{count}</span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section aria-label="Recent activity">
          <h2 className="ct-section-title">Recent activity</h2>
          {auditQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => auditQ.refetch()} /></div>
          ) : auditLogs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No recent workspace activity.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {auditLogs.map((log: { id: string; action: string; created_at: string }) => (
                <li key={log.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-2.5">
                  <span className="truncate text-sm text-foreground-secondary">{log.action.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Open jobs needing attention">
          <div className="flex items-center justify-between">
            <h2 className="ct-section-title">Open jobs</h2>
            <Link href="/company/jobs" className="text-[13px] font-semibold text-primary hover:underline">
              Manage jobs
            </Link>
          </div>
          {offersQ.isError ? (
            <div className="mt-3"><SectionError onRetry={() => offersQ.refetch()} /></div>
          ) : offers.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No jobs yet" description="Publish first role to start receiving candidates." primaryAction={{ label: "Create job", href: "/company/jobs" }} />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {offers.slice(0, 4).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{o.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.region} · {apps.filter((a) => a.opportunity_id === o.id).length} applicants
                    </span>
                  </span>
                  <StatusBadge status={o.active ? "active" : "paused"} size="sm" showDot={false} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
