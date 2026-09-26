import { Badge, type BadgeVariant } from "@/components/ui/badge";

export type ApplicationPhase = "applied" | "review" | "assessment" | "interview" | "decision";
export type UiStage = "Applied" | "Screening" | "Assessment" | "Interview" | "Offer" | "Accepted" | "Rejected" | "Other";

type StatusInfo = {
  label: string;
  summary: string;
  next: string;
  phase: ApplicationPhase;
  variant: BadgeVariant;
};

const statusInfo: Record<string, StatusInfo> = {
  applied: { label: "Applied", summary: "Your application has been submitted.", next: "No action is needed right now. Check back for a recruiter update.", phase: "applied", variant: "info" },
  under_review: { label: "Under review", summary: "The recruiter is reviewing your application.", next: "Keep an eye on this page for an update.", phase: "review", variant: "info" },
  shortlisted: { label: "Shortlisted", summary: "Your application has moved forward in review.", next: "Check your messages for any request from the recruiter.", phase: "review", variant: "primary" },
  assessment_required: { label: "Assessment required", summary: "An assessment is the current step for this application.", next: "Check your messages for assessment instructions. If none are available, contact the recruiter.", phase: "assessment", variant: "warning" },
  assessment_completed: { label: "Assessment completed", summary: "The assessment step is complete.", next: "Watch this page or your messages for the recruiter's next update.", phase: "assessment", variant: "primary" },
  interview: { label: "Interview stage", summary: "Your application is at the interview stage.", next: "Check your messages for scheduling details. No date is available in this tracker yet.", phase: "interview", variant: "warning" },
  accepted: { label: "Accepted", summary: "The recruiter has accepted your application.", next: "Check your messages with the recruiter for the next steps.", phase: "decision", variant: "success" },
  offer: { label: "Offer", summary: "An offer status has been recorded for this application.", next: "Contact the recruiter for the offer details and next steps.", phase: "decision", variant: "success" },
  rejected: { label: "Not selected", summary: "This application is closed.", next: "You can continue exploring other opportunities.", phase: "decision", variant: "neutral" },
};

export function applicationStatusInfo(status: string): StatusInfo {
  return statusInfo[status.toLowerCase()] ?? {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    summary: "The status of this application has changed.",
    next: "Check your messages or contact the recruiter for details.",
    phase: "review",
    variant: "neutral",
  };
}

export function mapStatusToStage(status: string): UiStage {
  switch (status.toLowerCase()) {
    case "applied": return "Applied";
    case "under_review":
    case "shortlisted": return "Screening";
    case "assessment_required":
    case "assessment_completed": return "Assessment";
    case "interview": return "Interview";
    case "offer": return "Offer";
    case "accepted": return "Accepted";
    case "rejected": return "Rejected";
    default: return "Other";
  }
}

export function stageLabel(status: string): string {
  return applicationStatusInfo(status).label;
}

export function ApplicationStage({ status }: { status: string }) {
  const info = applicationStatusInfo(status);
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

const order: UiStage[] = ["Applied", "Screening", "Assessment", "Interview", "Offer", "Accepted"];

export function stageIndex(status: string): number {
  return order.indexOf(mapStatusToStage(status));
}

export function nextStepFor(status: string): string {
  return applicationStatusInfo(status).next;
}

export { order as applicationStageOrder };
