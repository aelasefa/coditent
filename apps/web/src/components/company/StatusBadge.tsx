"use client";

import { Badge, type BadgeVariant as CanonicalVariant } from "@/components/ui/badge";

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

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    applied: "Applied",
    under_review: "Under review",
    shortlisted: "Shortlisted",
    assessment_required: "Assessment",
    assessment_completed: "Assessed",
    interview: "Interview",
    accepted: "Hired",
    rejected: "Rejected",
    active: "Active",
    paused: "Paused",
    draft: "Draft",
    closed: "Closed",
    pending: "Pending",
    in_progress: "In progress",
    completed: "Completed",
    evaluated: "Evaluated",
    OWNER: "Owner",
    ADMIN: "Admin",
    HR: "HR",
    RECRUITER: "Recruiter",
    HIRING_MANAGER: "Hiring manager",
    neutral: "Neutral",
  };
  if (labels[key]) return labels[key];
  return String(key || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Color communicates category, not decoration.
function variantFor(key: string): CanonicalVariant {
  switch (key) {
    case "applied":
    case "under_review":
    case "pending":
    case "in_progress":
    case "draft":
      return "info";
    case "shortlisted":
    case "assessment_required":
    case "assessment_completed":
    case "interview":
    case "OWNER":
    case "ADMIN":
    case "HR":
    case "RECRUITER":
    case "HIRING_MANAGER":
      return "primary";
    case "completed":
    case "evaluated":
    case "accepted":
    case "active":
      return "success";
    case "paused":
    case "closed":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export function StatusBadge({ status, variant, size = "sm", showDot = true }: StatusBadgeProps) {
  const key = variant || status || "neutral";
  return (
    <Badge variant={variantFor(key)} dot={showDot} className={size === "md" ? "px-3 py-1" : undefined}>
      {labelFor(key)}
    </Badge>
  );
}
