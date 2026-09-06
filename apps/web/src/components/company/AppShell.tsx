"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMe, getAuditLogs, getCompany } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { StatusBadge } from "./StatusBadge";
import {
  FiGrid,
  FiBriefcase,
  FiUsers,
  FiFileText,
  FiMail,
  FiShield,
  FiTrendingUp,
  FiSettings,
  FiSearch,
  FiBell,
  FiLogOut,
  FiMenu,
  FiX,
  FiPlus,
  FiChevronDown,
  FiSun,
  FiMoon,
} from "react-icons/fi";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      {
        label: "Dashboard",
        href: "/company",
        icon: FiGrid,
        exact: true,
      },
    ],
  },
  {
    title: "JOBS & PIPELINE",
    items: [
      { label: "All Jobs", href: "/company/jobs", icon: FiBriefcase },
      { label: "Candidates", href: "/company/candidates", icon: FiUsers },
      { label: "Assessments", href: "/company/assessments", icon: FiFileText },
    ],
  },
  {
    title: "TEAM & ACCESS",
    items: [
      { label: "Invitations", href: "/company/invitations", icon: FiMail },
      { label: "Team Members", href: "/company/team", icon: FiShield },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      { label: "Analytics", href: "/company/analytics", icon: FiTrendingUp },
    ],
  },
  {
    title: "ORGANIZATION",
    items: [
      { label: "Company Settings", href: "/company/settings", icon: FiSettings },
    ],
  },
];

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/company/candidates?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("coditent_token");
      document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans antialiased selection:bg-zinc-900 dark:selection:bg-zinc-100 selection:text-white dark:selection:text-zinc-900 transition-colors duration-200">
      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex w-72 max-w-full flex-col bg-white dark:bg-[#0C0C0E] border-r border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 text-zinc-900 dark:text-zinc-100">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <Link href="/company" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm tracking-wider">
                  C
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
                    CODITENT
                  </span>
                  <span className="text-[10px] font-medium text-zinc-400 -mt-0.5">
                    Recruitment Suite
                  </span>
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <FiSun className="h-4 w-4 text-amber-400" /> : <FiMoon className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label="Close Navigation"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mobile Nav Links */}
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {NAV_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                  <p className="px-3 text-[10px] font-bold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          isActive
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Mobile User Footer */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">
                  {me?.full_name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {me?.full_name || "Recruiter"}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{me?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <FiLogOut className="h-3.5 w-3.5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main App Layout */}
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0C0C0E] transition-colors duration-200">
          {/* Logo & Company Badge */}
          <div className="flex flex-col border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
            <Link href="/company" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm tracking-wider shadow-sm">
                C
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
                  CODITENT
                </span>
                <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Talent Platform
                </span>
              </div>
            </Link>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {company?.name || "Company Workspace"}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                  {company?.industry || "HR & Talent"}
                </p>
              </div>
              <StatusBadge status={me?.company_role || "RECRUITER"} size="sm" showDot={false} />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-5">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-1">
                <p className="px-3 text-[10px] font-bold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive
                            ? "text-white dark:text-zinc-900"
                            : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                        }`}
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* User Profile Card / Footer */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between rounded-lg p-1.5 hover:bg-white dark:hover:bg-zinc-850 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-750">
              <Link
                href="/company/settings"
                className="flex items-center gap-2.5 min-w-0 flex-1"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">
                  {me?.full_name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {me?.full_name || "Recruiter"}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{me?.email}</p>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                title="Log out"
                className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                aria-label="Log out"
              >
                <FiLogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Content Wrapper */}
        <div className="flex flex-1 flex-col md:pl-64">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#0C0C0E]/95 px-4 sm:px-6 backdrop-blur-md transition-colors duration-200">
            {/* Left: Mobile hamburger & Search bar */}
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden rounded-lg p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Open menu"
              >
                <FiMenu className="h-5 w-5" />
              </button>

              <form onSubmit={handleSearchSubmit} className="relative w-full max-w-xs">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Quick search candidates, jobs…"
                  className="h-8 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 pl-8 pr-3 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-600 focus:outline-none transition-all"
                />
              </form>
            </div>

            {/* Right: Theme Toggle, Quick Action, Notifications, User Menu */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="rounded-lg p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <FiSun className="h-4 w-4 text-amber-400" />
                ) : (
                  <FiMoon className="h-4 w-4" />
                )}
              </button>

              <Link
                href="/company/jobs"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                <FiPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Create Job</span>
              </Link>

              {/* Notification Center */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative rounded-lg p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
                  aria-label="Activity notifications"
                >
                  <FiBell className="h-4 w-4" />
                  {recentLogs.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600" />
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] shadow-lg p-2 z-50 text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Recent Activity
                      </span>
                      <Link
                        href="/company/analytics"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      >
                        View analytics
                      </Link>
                    </div>
                    <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60 max-h-64 overflow-y-auto">
                      {recentLogs.length === 0 ? (
                        <p className="p-4 text-center text-xs text-zinc-400">
                          No recent notifications
                        </p>
                      ) : (
                        recentLogs.map((log) => (
                          <div key={log.id} className="p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg">
                            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                              {humanizeAuditAction(log.action)}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {new Date(log.created_at).toLocaleDateString()} · {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="User profile menu"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">
                    {me?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <FiChevronDown className="h-3.5 w-3.5 text-zinc-400 hidden sm:block" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] shadow-lg p-1.5 z-50 text-zinc-900 dark:text-zinc-100">
                    <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {me?.full_name || "Recruiter"}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{me?.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/company/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <FiSettings className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Company Settings</span>
                      </Link>
                      <Link
                        href="/company/team"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <FiShield className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Team & Roles</span>
                      </Link>
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <FiLogOut className="h-3.5 w-3.5" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
