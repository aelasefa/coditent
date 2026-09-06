"use client";

import React from "react";

export type BadgeVariant =
  | "applied"
  | "under_review"
  | "shortlisted"
  | "assessment_required"
  | "assessment_completed"
  | "interview"
  | "accepted"
  | "rejected"
  | "active"
  | "paused"
  | "draft"
  | "closed"
  | "pending"
  | "in_progress"
  | "completed"
  | "evaluated"
  | "OWNER"
  | "ADMIN"
  | "HR"
  | "RECRUITER"
  | "HIRING_MANAGER"
  | "neutral";

interface StatusBadgeProps {
  status: string | null | undefined;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  showDot?: boolean;
}

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  // Applications
  applied: {
    label: "Applied",
    bg: "bg-blue-50/80 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500 dark:bg-blue-400",
    border: "border-blue-200/60 dark:border-blue-800/50",
  },
  under_review: {
    label: "Under Review",
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500 dark:bg-amber-400",
    border: "border-amber-200/60 dark:border-amber-800/50",
  },
  shortlisted: {
    label: "Shortlisted",
    bg: "bg-indigo-50/80 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    border: "border-indigo-200/60 dark:border-indigo-800/50",
  },
  assessment_required: {
    label: "Assessment Req.",
    bg: "bg-purple-50/80 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    dot: "bg-purple-500 dark:bg-purple-400",
    border: "border-purple-200/60 dark:border-purple-800/50",
  },
  assessment_completed: {
    label: "Assessment Done",
    bg: "bg-violet-50/80 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500 dark:bg-violet-400",
    border: "border-violet-200/60 dark:border-violet-800/50",
  },
  interview: {
    label: "Interview",
    bg: "bg-cyan-50/80 dark:bg-cyan-950/40",
    text: "text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500 dark:bg-cyan-400",
    border: "border-cyan-200/60 dark:border-cyan-800/50",
  },
  accepted: {
    label: "Hired",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/50",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-rose-50/80 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500 dark:bg-rose-400",
    border: "border-rose-200/60 dark:border-rose-800/50",
  },

  // Jobs / Offers
  active: {
    label: "Active",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/50",
  },
  paused: {
    label: "Paused",
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    border: "border-zinc-200 dark:border-zinc-700",
  },
  draft: {
    label: "Draft",
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    border: "border-zinc-200 dark:border-zinc-700",
  },
  closed: {
    label: "Closed",
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    border: "border-zinc-200 dark:border-zinc-700",
  },

  // Assessments
  pending: {
    label: "Pending",
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500 dark:bg-amber-400",
    border: "border-amber-200/60 dark:border-amber-800/50",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-blue-50/80 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500 dark:bg-blue-400",
    border: "border-blue-200/60 dark:border-blue-800/50",
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/50",
  },
  evaluated: {
    label: "Evaluated",
    bg: "bg-indigo-50/80 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    border: "border-indigo-200/60 dark:border-indigo-800/50",
  },

  // Invitations
  PENDING: {
    label: "Pending",
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500 dark:bg-amber-400",
    border: "border-amber-200/60 dark:border-amber-800/50",
  },
  ACCEPTED: {
    label: "Accepted",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/50",
  },
  REVOKED: {
    label: "Revoked",
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    border: "border-zinc-200 dark:border-zinc-700",
  },
  EXPIRED: {
    label: "Expired",
    bg: "bg-rose-50/80 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500 dark:bg-rose-400",
    border: "border-rose-200/60 dark:border-rose-800/50",
  },

  // Roles
  OWNER: {
    label: "Owner",
    bg: "bg-slate-900 dark:bg-zinc-100",
    text: "text-white dark:text-zinc-900",
    dot: "bg-indigo-400 dark:bg-indigo-600",
    border: "border-slate-800 dark:border-zinc-200",
  },
  ADMIN: {
    label: "Admin",
    bg: "bg-indigo-50 dark:bg-indigo-950/50",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    border: "border-indigo-200 dark:border-indigo-800/50",
  },
  HR: {
    label: "HR",
    bg: "bg-teal-50 dark:bg-teal-950/50",
    text: "text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500 dark:bg-teal-400",
    border: "border-teal-200 dark:border-teal-800/50",
  },
  RECRUITER: {
    label: "Recruiter",
    bg: "bg-blue-50 dark:bg-blue-950/50",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500 dark:bg-blue-400",
    border: "border-blue-200 dark:border-blue-800/50",
  },
  HIRING_MANAGER: {
    label: "Hiring Manager",
    bg: "bg-violet-50 dark:bg-violet-950/50",
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500 dark:bg-violet-400",
    border: "border-violet-200 dark:border-violet-800/50",
  },
};

export function StatusBadge({
  status,
  variant,
  size = "sm",
  showDot = true,
}: StatusBadgeProps) {
  const key = variant || status || "neutral";
  const config = statusConfig[key] || {
    label: String(status || "Unknown").replace(/_/g, " "),
    bg: "bg-zinc-100 dark:bg-zinc-800",
    text: "text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    border: "border-zinc-200 dark:border-zinc-700",
  };

  const isSmall = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full ${
        config.bg
      } ${config.text} ${config.border} ${
        isSmall ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-xs"
      }`}
    >
      {showDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${config.dot} shrink-0`}
          aria-hidden="true"
        />
      )}
      <span className="capitalize">{config.label}</span>
    </span>
  );
}
