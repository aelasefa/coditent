"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs, getCompany, getMe, companyLogoSrc } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme-context";
import { StatusBadge } from "./StatusBadge";
import { AppShell as SharedShell } from "@/components/shell/app-shell";
import { PageContainer } from "@/components/shell/page-container";
import { companyNavSections } from "@/components/shell/nav-config";
import { FiBell, FiMoon, FiPlus, FiSearch, FiSun } from "react-icons/fi";

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
    COMPANY_CREATED: "Company created",
    COMPANY_UPDATED: "Company profile updated",
    APPLICATION_CREATED: "New candidate applied",
    APPLICATION_STATUS_CHANGED: "Application status updated",
    CANDIDATE_SHORTLISTED: "Candidate shortlisted",
    CANDIDATE_REJECTED: "Candidate rejected",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
}

function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("coditent_token");
    document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const { data: company } = useQuery({
    queryKey: ["company-profile", me?.company_id],
    queryFn: () => (me?.company_id ? getCompany(me.company_id) : null),
    enabled: !!me?.company_id,
    staleTime: 60_000,
  });
  const { data: auditData } = useQuery({
    queryKey: ["audit-recent"],
    queryFn: getAuditLogs,
    enabled: !!me,
    staleTime: 30_000,
  });
  const recentLogs = auditData?.logs?.slice(0, 6) ?? [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/company/candidates?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <SharedShell
      navSections={companyNavSections}
      logoHref="/company"
      user={{
        name: me?.full_name || "Recruiter",
        email: me?.email ?? undefined,
        roleLabel: me?.company_role ?? undefined,
      }}
      userMenuItems={[
        { label: "Company Settings", href: "/company/settings" },
        { label: "Team and Roles", href: "/company/team" },
      ]}
      onLogout={logout}
      workspaceCard={
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2">
          <Avatar src={company ? companyLogoSrc(company) : null} name={company?.name || "Company Workspace"} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {company?.name || "Company Workspace"}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-muted-foreground">
                {company?.industry || "HR and Talent"}
              </span>
              <StatusBadge status={String(me?.company_role ?? "RECRUITER")} size="sm" showDot={false} />
            </div>
          </div>
        </div>
      }
      searchSlot={
        <form onSubmit={handleSearchSubmit} role="search" className="relative w-full max-w-xs">
          <label htmlFor="company-shell-search" className="sr-only">
            Search candidates and jobs
          </label>
          <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="company-shell-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates, jobs"
            className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </form>
      }
      topbarAction={
        <>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
          >
            {theme === "dark" ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
          </button>
          <Link
            href="/company/jobs"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <FiPlus aria-hidden className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Create Job</span>
            <span className="sm:hidden">New</span>
          </Link>
        </>
      }
      notificationSlot={
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-expanded={notifOpen}
            aria-label="Activity notifications"
            className="relative rounded-lg p-2 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
          >
            <FiBell aria-hidden className="h-4 w-4" />
            {recentLogs.length > 0 ? (
              <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            ) : null}
          </button>
          {notifOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border-subtle bg-surface p-2 shadow-md">
              <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
                <span className="text-xs font-semibold text-foreground">Recent Activity</span>
                <Link
                  href="/company/analytics"
                  onClick={() => setNotifOpen(false)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  View analytics
                </Link>
              </div>
              <div className="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto">
                {recentLogs.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">No recent notifications</p>
                ) : (
                  recentLogs.map((log) => (
                    <div key={log.id} className="rounded-lg p-2.5 hover:bg-surface-secondary">
                      <p className="text-xs font-medium text-foreground">{humanizeAuditAction(log.action)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString()} ·{" "}
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      }
    >
      <PageContainer variant="wide">{children}</PageContainer>
    </SharedShell>
  );
}
