"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/shell/page-container";
import { StatCard } from "@/components/company/StatCard";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { StatCardsSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { getAdminActivity, getAdminStats, getCompanies, listCompanyInvitations } from "@/lib/api";
import { FiBriefcase, FiMail, FiPlus, FiUsers } from "react-icons/fi";

export default function AdminOverviewPage() {
  const statsQ = useQuery({ queryKey: ["admin", "stats"], queryFn: getAdminStats });
  const activityQ = useQuery({ queryKey: ["admin", "activity"], queryFn: getAdminActivity });
  const companiesQ = useQuery({ queryKey: ["companies"], queryFn: getCompanies });
  const invitesQ = useQuery({ queryKey: ["admin-company-invites"], queryFn: listCompanyInvitations });

  const stats = statsQ.data;
  const loading = statsQ.isLoading;
  const failed = statsQ.isError;
  const companies = (companiesQ.data ?? []).slice(0, 5);
  const invites = (invitesQ.data?.invitations ?? []).slice(0, 5);
  const activity = (activityQ.data ?? []).slice(0, 6);

  return (
    <AdminShell>
      <div className="space-y-8">
        <PageHeader
          title="Overview"
          description="Platform health across companies, invitations, candidates and offers."
          actions={
            <Link href="/admin/company-invitations" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              <FiPlus aria-hidden className="h-3.5 w-3.5" /> Invite company
            </Link>
          }
        />

        <section aria-label="Platform statistics">
          {loading ? (
            <StatCardsSkeleton />
          ) : failed || !stats ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
              <p className="text-sm font-semibold text-danger">Could not load platform statistics.</p>
              <Button size="sm" variant="outline" onClick={() => statsQ.refetch()} className="mt-2">Retry</Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Companies" value={stats.total_companies} subValue={`${stats.active_companies} active`} icon={FiBriefcase} />
              <StatCard label="Pending invites" value={stats.pending_company_invitations} subValue={`${stats.expired_company_invitations} expired`} icon={FiMail} />
              <StatCard label="Candidates" value={stats.total_candidates} subValue={`${stats.total_users} total users`} icon={FiUsers} />
              <StatCard label="Active offers" value={stats.active_offers} subValue={`${stats.total_offers} total offers`} icon={FiBriefcase} highlight />
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Recent companies">
            <div className="flex items-baseline justify-between">
              <h2 className="ct-section-title">Recent companies</h2>
              <Link href="/admin/companies" className="text-[13px] font-semibold text-primary hover:underline">View all</Link>
            </div>
            {companiesQ.isError ? (
              <p role="alert" className="mt-3 text-sm text-danger">Could not load companies.</p>
            ) : companies.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No companies yet" description="Invite first organization to create its workspace." primaryAction={{ label: "Invite company", href: "/admin/company-invitations" }} />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {companies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.industry || "No industry set"}</span>
                    </span>
                    <StatusBadge status={c.status || "active"} size="sm" showDot={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Recent invitations">
            <div className="flex items-baseline justify-between">
              <h2 className="ct-section-title">Recent invitations</h2>
              <Link href="/admin/company-invitations" className="text-[13px] font-semibold text-primary hover:underline">Manage</Link>
            </div>
            {invitesQ.isError ? (
              <p role="alert" className="mt-3 text-sm text-danger">Could not load invitations.</p>
            ) : invites.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No invitations sent" description="Pending and recent company invitations appear here." />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{inv.company_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{inv.email}</span>
                    </span>
                    <StatusBadge status={inv.status} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Platform activity">
          <h2 className="ct-section-title">Platform activity</h2>
          {activityQ.isError ? (
            <p role="alert" className="mt-3 text-sm text-danger">Could not load activity.</p>
          ) : activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No recent platform events.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activity.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-2.5">
                  <span className="truncate text-sm text-foreground-secondary">{log.action.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(log.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
