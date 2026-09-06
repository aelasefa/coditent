"use client";

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { EmptyState } from "@/components/company/EmptyState";
import { StatCardsSkeleton } from "@/components/company/LoadingSkeleton";
import { getMe, getApplications, getAssessments, getAuditLogs, getApiBaseUrl } from "@/lib/api";
import { Offer, ApplicationItem, AssessmentItem, AuditLogItem } from "@/lib/types";
import {
  FiTrendingUp,
  FiUsers,
  FiFileText,
  FiUserCheck,
  FiBarChart2,
  FiActivity,
} from "react-icons/fi";

function humanizeAuditAction(action: string): string {
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
    APPLICATION_CREATED: "New candidate applied",
    APPLICATION_STATUS_CHANGED: "Application status updated",
    CANDIDATE_SHORTLISTED: "Candidate shortlisted",
    CANDIDATE_REJECTED: "Candidate rejected",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
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
      }).then((x) => x.json()).catch(() => ({ offers: [] }));
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

  const auditQ = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await getAuditLogs()).logs as AuditLogItem[],
    enabled: !!me,
  });

  const offers = offersQ.data ?? [];
  const apps = appsQ.data ?? [];
  const assessments = assQ.data ?? [];
  const auditLogs = auditQ.data ?? [];

  const byStatus = (s: string) => apps.filter((a) => a.status === s).length;
  const totalApps = apps.length;

  const funnel = useMemo(() => {
    const stages = [
      { key: "applied", label: "Applied", count: totalApps },
      { key: "under_review", label: "Under Review", count: byStatus("under_review") + byStatus("shortlisted") + byStatus("interview") + byStatus("accepted") },
      { key: "assessment", label: "Assessed", count: byStatus("assessment_completed") + byStatus("shortlisted") + byStatus("interview") + byStatus("accepted") },
      { key: "shortlisted", label: "Shortlisted", count: byStatus("shortlisted") + byStatus("interview") + byStatus("accepted") },
      { key: "interview", label: "Interview", count: byStatus("interview") + byStatus("accepted") },
      { key: "accepted", label: "Hired", count: byStatus("accepted") },
    ];
    return stages;
  }, [apps, totalApps]);

  const scoredAss = assessments.filter((a) => typeof a.score === "number");
  const avgScore =
    scoredAss.length > 0
      ? Math.round(scoredAss.reduce((acc, a) => acc + (a.score || 0), 0) / scoredAss.length)
      : 0;

  const conversionRate = totalApps > 0 ? Math.round((byStatus("accepted") / totalApps) * 100) : 0;
  const shortlistRate = totalApps > 0 ? Math.round((byStatus("shortlisted") / totalApps) * 100) : 0;

  const isLoading = offersQ.isLoading || appsQ.isLoading;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Recruitment Analytics & Insights"
          subtitle="Real-time recruitment metrics, candidate conversion funnel, and practical assessment performance."
        />

        {isLoading ? (
          <StatCardsSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Applications Volume"
              value={totalApps}
              subValue={`${offers.length} active positions`}
              icon={FiUsers}
            />
            <StatCard
              label="Shortlist Rate"
              value={`${shortlistRate}%`}
              subValue={`${byStatus("shortlisted")} candidates shortlisted`}
              icon={FiUserCheck}
            />
            <StatCard
              label="Hire Conversion"
              value={`${conversionRate}%`}
              subValue={`${byStatus("accepted")} hires completed`}
              icon={FiTrendingUp}
              highlight={true}
            />
            <StatCard
              label="Avg Assessment Score"
              value={scoredAss.length > 0 ? `${avgScore} / 100` : "—"}
              subValue={`${scoredAss.length} practical tests graded`}
              icon={FiFileText}
            />
          </div>
        )}

        {/* Funnel Visualization & Assessment Breakdown */}
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Recruitment Funnel */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recruitment Funnel & Drop-off</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Pipeline progression from application to hire</p>
              </div>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
                {totalApps} Total Inflow
              </span>
            </div>

            {totalApps === 0 ? (
              <EmptyState
                icon={FiBarChart2}
                title="No funnel data available"
                description="Funnel analytics will populate as candidates apply and advance through screening and assessment stages."
              />
            ) : (
              <div className="space-y-3.5">
                {funnel.map((stage) => {
                  const pct = totalApps > 0 ? Math.round((stage.count / totalApps) * 100) : 0;
                  return (
                    <div key={stage.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-zinc-700 dark:text-zinc-300">{stage.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{stage.count}</span>
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500"
                          style={{ width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assessment Distribution */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Skills Evaluation Health</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Practical test engagement & quality</p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">Total Assessments Created</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{assessments.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">Completed & Scored</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {assessments.filter((a) => a.status === "completed" || a.status === "evaluated").length}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">Pending Candidate Action</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {assessments.filter((a) => a.status === "pending" || a.status === "in_progress").length}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-zinc-600 dark:text-zinc-400">Average Technical Score</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {scoredAss.length > 0 ? `${avgScore} / 100` : "No tests scored"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400 dark:text-zinc-500">
              Technical scores are generated through practical programming exercises and domain benchmarks.
            </div>
          </div>
        </div>

        {/* Activity Audit Timeline */}
        <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <FiActivity className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Workspace Activity Audit Log</h3>
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{auditLogs.length} Events Recorded</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
              No recent audit activity records found.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="px-6 py-3">Action Type</th>
                    <th className="px-6 py-3">Details / Context</th>
                    <th className="px-6 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {auditLogs.slice(0, 10).map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-850 transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">
                        {humanizeAuditAction(log.action)}
                      </td>
                      <td className="px-6 py-3.5 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
                        {log.details || "System verified"}
                      </td>
                      <td className="px-6 py-3.5 text-right text-zinc-400 dark:text-zinc-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
