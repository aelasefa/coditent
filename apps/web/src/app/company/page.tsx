"use client";

import React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { StatCardsSkeleton, TableSkeleton } from "@/components/company/LoadingSkeleton";
import {
  getMe,
  getApplications,
  getAssessments,
  getAuditLogs,
  updateApplicationStatus,
  getCompany,
} from "@/lib/api";
import {
  FiBriefcase,
  FiUsers,
  FiFileText,
  FiUserCheck,
  FiPlus,
  FiClock,
  FiArrowRight,
  FiAlertCircle,
  FiCheckCircle,
  FiActivity,
} from "react-icons/fi";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function humanizeAction(action: string) {
  const map: Record<string, string> = {
    OFFER_CREATED: "Job offer published",
    OFFER_UPDATED: "Job offer updated",
    OFFER_DELETED: "Job offer removed",
    EMPLOYEE_INVITED: "New employee invited",
    EMPLOYEE_INVITATION_ACCEPTED: "Invitation accepted",
    EMPLOYEE_INVITATION_REVOKED: "Invitation revoked",
    EMPLOYEE_ROLE_CHANGED: "Team role updated",
    EMPLOYEE_REMOVED: "Team member removed",
    COMPANY_CREATED: "Company workspace created",
    COMPANY_UPDATED: "Company details updated",
    APPLICATION_CREATED: "New candidate application",
    APPLICATION_STATUS_CHANGED: "Application status updated",
    CANDIDATE_SHORTLISTED: "Candidate shortlisted",
    CANDIDATE_REJECTED: "Candidate rejected",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
}

export default function CompanyDashboard() {
  const qc = useQueryClient();
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
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/offers/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      }).then((x) => x.json()).catch(() => ({ offers: [] }));
      return r.offers || [];
    },
    enabled: !!me,
  });

  const appsQ = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications,
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

  const shortlistMut = useMutation({
    mutationFn: (appId: string) => updateApplicationStatus(appId, "shortlisted"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const offers = offersQ.data ?? [];
  const apps = appsQ.data ?? [];
  const assessments = assQ.data ?? [];
  const auditLogs = auditQ.data ?? [];

  const activeOffers = offers.filter((o: any) => o.active).length;
  const byStatus = (s: string) => apps.filter((a: any) => a.status === s).length;

  const pipelineStages = [
    { key: "applied", label: "Applied", count: byStatus("applied") },
    { key: "under_review", label: "Review", count: byStatus("under_review") },
    { key: "assessment", label: "Assessment", count: byStatus("assessment_required") + byStatus("assessment_completed") },
    { key: "shortlisted", label: "Shortlisted", count: byStatus("shortlisted") },
    { key: "interview", label: "Interview", count: byStatus("interview") },
    { key: "accepted", label: "Hired", count: byStatus("accepted") },
  ];

  const appliedPending = apps.filter((a: any) => a.status === "applied");
  const assessmentsPending = assessments.filter((a: any) => a.status === "pending");

  const attentionItems = [
    ...appliedPending.slice(0, 3).map((a: any) => ({
      id: a.id,
      title: "Application awaiting review",
      sub: `Position ref: ${a.opportunity_id ? a.opportunity_id.slice(0, 8) : "General"} · Candidate: ${a.candidate_id ? a.candidate_id.slice(0, 8) : "Applicant"}`,
      type: "application",
      href: "/company/candidates",
    })),
    ...assessmentsPending.slice(0, 2).map((a: any) => ({
      id: a.id,
      title: "Practical assessment pending score",
      sub: `Assessment ID: ${a.id.slice(0, 8)}`,
      type: "assessment",
      href: "/company/assessments",
    })),
  ];

  const isLoading = offersQ.isLoading || appsQ.isLoading;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <PageHeader
          title={`${getGreeting()}, ${me?.full_name?.split(" ")[0] || "Recruiter"}`}
          subtitle={`Welcome to the ${company?.name || "Company"} workspace. Here's what's happening across your recruiting pipeline today.`}
          actions={
            <Link
              href="/company/jobs"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              <FiPlus className="h-4 w-4" />
              <span>Create job offer</span>
            </Link>
          }
        />

        {/* KPI Overview Grid */}
        {isLoading ? (
          <StatCardsSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active Jobs"
              value={activeOffers}
              subValue={`${offers.length} total · ${offers.length - activeOffers} paused`}
              icon={FiBriefcase}
              trend={{ value: `${offers.length} positions`, isPositive: true }}
            />
            <StatCard
              label="Total Applications"
              value={apps.length}
              subValue={`${byStatus("applied")} new · ${byStatus("under_review")} under review`}
              icon={FiUsers}
              trend={{ value: `${byStatus("applied")} awaiting`, isPositive: byStatus("applied") > 0 }}
            />
            <StatCard
              label="Assessments"
              value={assessments.length}
              subValue={`${assessments.filter((a: any) => a.status === "completed").length} completed · ${assessmentsPending.length} pending`}
              icon={FiFileText}
            />
            <StatCard
              label="Shortlisted & Hired"
              value={byStatus("shortlisted") + byStatus("accepted")}
              subValue={`${byStatus("shortlisted")} shortlisted · ${byStatus("accepted")} hired`}
              icon={FiUserCheck}
              highlight={true}
            />
          </div>
        )}

        {/* Recruitment Pipeline + Attention Grid */}
        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
          {/* Recruitment Pipeline */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recruitment Pipeline</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Applied → Review → Assessment → Shortlist → Interview → Hired
                </p>
              </div>
              <Link
                href="/company/candidates"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
              >
                <span>View ATS</span>
                <FiArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {pipelineStages.map((stage) => (
                <Link
                  key={stage.key}
                  href={`/company/candidates?status=${stage.key === "assessment" ? "assessment_completed" : stage.key}`}
                  className="flex flex-col items-center justify-center rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5 text-center hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 hover:border-zinc-200 dark:hover:border-zinc-700 transition-all group"
                >
                  <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:scale-105 transition-transform">
                    {stage.count}
                  </span>
                  <span className="mt-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide uppercase">
                    {stage.label}
                  </span>
                </Link>
              ))}
            </div>

            {apps.length === 0 && (
              <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 py-2.5 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                Pipeline is waiting for applicants. Publish your job offers to receive candidates.
              </p>
            )}
          </div>

          {/* Action Items / Attention Needed */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Needs Attention</h2>
                </div>
                <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                  {attentionItems.length} Pending
                </span>
              </div>

              {attentionItems.length === 0 ? (
                <div className="py-8 text-center">
                  <FiCheckCircle className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">All caught up!</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    No pending candidate reviews or unverified assessments.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {attentionItems.map((item, idx) => (
                    <li key={idx} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {item.sub}
                        </p>
                      </div>
                      <Link
                        href={item.href}
                        className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shrink-0"
                      >
                        Review
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Link
                href="/company/candidates"
                className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <span>Open Candidate Management</span>
                <FiArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Applications & Activity Stream */}
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Recent Applications Table */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recent Applications</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Latest candidate submissions for your open positions</p>
              </div>
              <Link
                href="/company/candidates"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
              >
                <span>View all</span>
                <FiArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {appsQ.isLoading ? (
              <div className="p-6">
                <TableSkeleton rows={4} cols={4} />
              </div>
            ) : apps.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={FiUsers}
                  title="No applications yet"
                  description="Once candidates apply to your positions, you'll be able to review their profiles, screening results, and practical assessments here."
                  primaryAction={{
                    label: "Create Job Offer",
                    href: "/company/jobs",
                  }}
                  secondaryAction={{
                    label: "View All Jobs",
                    href: "/company/jobs",
                  }}
                />
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-x-auto">
                {apps.slice(0, 5).map((app: any) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-zinc-50/70 dark:hover:bg-zinc-850 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          Candidate {app.candidate_id ? app.candidate_id.slice(0, 8) : "Applicant"}
                        </span>
                        <StatusBadge status={app.status} size="sm" />
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Position: {app.opportunity_id ? app.opportunity_id.slice(0, 8) : "Standard"} · Applied {app.created_at ? new Date(app.created_at).toLocaleDateString() : "Recently"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {app.status === "applied" && (
                        <button
                          type="button"
                          onClick={() => shortlistMut.mutate(app.id)}
                          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                        >
                          Shortlist
                        </button>
                      )}
                      <Link
                        href="/company/candidates"
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log Stream */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <FiActivity className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recruitment Activity</h2>
              </div>
              <Link
                href="/company/analytics"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Analytics
              </Link>
            </div>

            {auditQ.isLoading ? (
              <div className="p-6">
                <TableSkeleton rows={4} cols={2} />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                No recent activity logged.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {auditLogs.slice(0, 6).map((log: any) => (
                  <div key={log.id} className="px-6 py-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-850 transition-colors">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {humanizeAction(log.action)}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1.5">
                      <FiClock className="h-3 w-3" />
                      <span>{new Date(log.created_at).toLocaleDateString()} at {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
