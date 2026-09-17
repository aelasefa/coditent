"use client";

import type { ComponentType } from "react";
import {
  FiHome,
  FiSearch,
  FiBriefcase,
  FiMessageSquare,
  FiUser,
  FiGrid,
  FiUsers,
  FiFileText,
  FiMail,
  FiShield,
  FiTrendingUp,
  FiSettings,
} from "react-icons/fi";

export type NavMatch = "exact" | "prefix";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  match?: NavMatch;
  permission?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  if (item.href === "/company") return pathname === "/company";
  if (item.href === "/dashboard") return pathname === "/dashboard";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const candidateNavItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: FiHome, match: "exact" },
  { label: "Discover", href: "/dashboard/recommendations", icon: FiSearch, match: "prefix" },
  { label: "My Applications", href: "/dashboard/applications", icon: FiBriefcase, match: "prefix" },
  { label: "Messages", href: "/chat", icon: FiMessageSquare, match: "prefix" },
  { label: "Profile", href: "/profile", icon: FiUser, match: "prefix" },
];

// Practice + Assessments hidden: routes do not exist yet. No fake links.
// Secondary Notifications/Settings/Help hidden: no candidate API or routes yet.
export const companyNavSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/company", icon: FiGrid, match: "exact" }],
  },
  {
    title: "Jobs and Pipeline",
    items: [
      { label: "All Jobs", href: "/company/jobs", icon: FiBriefcase, match: "prefix" },
      { label: "Candidates", href: "/company/candidates", icon: FiUsers, match: "prefix" },
      { label: "Assessments", href: "/company/assessments", icon: FiFileText, match: "prefix" },
      { label: "Messages", href: "/company/messages", icon: FiMessageSquare, match: "prefix" },
    ],
  },
  {
    title: "Team and Access",
    items: [
      { label: "Invitations", href: "/company/invitations", icon: FiMail, match: "prefix" },
      { label: "Team Members", href: "/company/team", icon: FiShield, match: "prefix" },
    ],
  },
  {
    title: "Insights",
    items: [{ label: "Analytics", href: "/company/analytics", icon: FiTrendingUp, match: "prefix" }],
  },
  {
    title: "Organization",
    items: [{ label: "Company Settings", href: "/company/settings", icon: FiSettings, match: "prefix" }],
  },
];

// Company Messages: /company/messages inbox built Phase 5 on listRecruitmentChats (responsible-HR scoped).
