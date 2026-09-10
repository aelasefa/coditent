import { Badge, type BadgeVariant } from "@/components/ui/badge";

export type UiStage = "Applied" | "Screening" | "Assessment" | "Interview" | "Offer" | "Rejected" | "Other";

const order: UiStage[] = ["Applied", "Screening", "Assessment", "Interview", "Offer"];

export function mapStatusToStage(status: string): UiStage {
  const s = status.toLowerCase();
  if (s === "applied") return "Applied";
  if (s === "under_review" || s === "shortlisted") return "Screening";
  if (s === "assessment_required" || s === "assessment_completed") return "Assessment";
  if (s === "interview") return "Interview";
  if (s === "accepted" || s === "offer") return "Offer";
  if (s === "rejected") return "Rejected";
  return "Other";
}

export function stageLabel(status: string): string {
  const mapped = mapStatusToStage(status);
  if (mapped !== "Other") return mapped;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const variantMap: Record<UiStage | "Other", BadgeVariant> = {
  Applied: "info",
  Screening: "info",
  Assessment: "primary",
  Interview: "warning",
  Offer: "success",
  Rejected: "danger",
  Other: "neutral",
};

export function ApplicationStage({ status }: { status: string }) {
  const stage = mapStatusToStage(status);
  return <Badge variant={variantMap[stage]}>{stageLabel(status)}</Badge>;
}

export function stageIndex(status: string): number {
  const stage = mapStatusToStage(status);
  if (stage === "Rejected") return -1;
  return order.indexOf(stage);
}

export function nextStepFor(status: string): string {
  const stage = mapStatusToStage(status);
  switch (stage) {
    case "Applied":
      return "Application submitted. Recruiter review is next.";
    case "Screening":
      return "Under recruiter review. No action needed right now.";
    case "Assessment":
      return "Assessment stage. Check tracker for assessment instructions.";
    case "Interview":
      return "Interview stage. Watch messages for scheduling.";
    case "Offer":
      return "You received an offer. Review details with recruiter.";
    case "Rejected":
      return "This application is no longer active.";
    default:
      return "Track updates here as recruiter advances your application.";
  }
}

export { order as applicationStageOrder };
