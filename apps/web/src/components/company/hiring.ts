import type { ApplicationItem } from "@/lib/types";

export type HiringStage =
  | "Applied"
  | "Screening"
  | "Shortlisted"
  | "Assessment"
  | "Interview"
  | "Offer"
  | "Rejected"
  | "Other";

export const HIRING_STAGES: HiringStage[] = [
  "Applied",
  "Screening",
  "Shortlisted",
  "Assessment",
  "Interview",
  "Offer",
];

export function hiringStage(status: string): HiringStage {
  const s = status.toLowerCase();
  if (s === "applied") return "Applied";
  if (s === "under_review") return "Screening";
  if (s === "shortlisted") return "Shortlisted";
  if (s === "assessment_required" || s === "assessment_completed") return "Assessment";
  if (s === "interview") return "Interview";
  if (s === "accepted" || s === "offer") return "Offer";
  if (s === "rejected") return "Rejected";
  return "Other";
}

export function candidateName(app: ApplicationItem): string {
  const c = app.candidate;
  if (c?.full_name && c.full_name.trim()) return c.full_name;
  if (c?.email) return c.email.split("@")[0];
  return "Candidate";
}

export function candidateInitials(app: ApplicationItem): string {
  const name = candidateName(app);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function jobTitleFor(app: ApplicationItem, offersById?: Map<string, string>): string {
  if (app.opportunity?.title) return app.opportunity.title;
  if (offersById?.get(app.opportunity_id)) return offersById.get(app.opportunity_id) as string;
  return "Open role";
}

export type AiState = "scored" | "pending" | "processing" | "failed" | "unavailable";

export function aiState(app: ApplicationItem): AiState {
  const status = (app.ai_status || "").toLowerCase();
  if (status === "failed") return "failed";
  if (status === "processing") return "processing";
  if (typeof app.ai_score === "number" && app.ai_score > 0) return "scored";
  if (status === "completed") return "unavailable";
  return "pending";
}
