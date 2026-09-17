import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationStage, nextStepFor, stageLabel } from "./application-stage";
import type { ApplicationItem, RecruitmentChatListItem } from "@/lib/types";
import styles from "./candidate-pages.module.css";

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ApplicationCard({
  app,
  chat,
}: {
  app: ApplicationItem;
  chat?: RecruitmentChatListItem | null;
}) {
  const title = chat?.offer_title ?? app.opportunity?.title ?? "Application";
  const company = chat?.company_name ?? app.opportunity?.company ?? null;
  const appliedDate = formatDate(app.created_at);
  const updatedDate = formatDate(app.updated_at);
  const canMessage = Boolean(app.chat_enabled || chat);

  return (
    <Card className={styles.applicationRow}>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {[company, appliedDate ? `Applied ${appliedDate}` : null].filter(Boolean).join(" · ") || stageLabel(app.status)}
            </p>
          </div>
          <ApplicationStage status={app.status} />
        </div>
        <p className="mt-2 text-[13px] text-foreground-secondary">{nextStepFor(app.status)}</p>
        {updatedDate ? <p className="mt-1 text-xs text-muted-foreground">Last update {updatedDate}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/applications?app=${app.id}`}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-surface-secondary"
          >
            View application
          </Link>
          {canMessage ? (
            <Link
              href={`/chat/recruitment/${app.id}`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Message recruiter
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApplicationTimeline({ status }: { status: string }) {
  const stages = ["Applied", "Screening", "Assessment", "Interview", "Offer"] as const;
  const current = stageLabel(status);
  const currentIdx = stages.indexOf(current as (typeof stages)[number]);
  const rejected = current === "Rejected";
  return (
    <ol aria-label="Application progress" className="mt-3 space-y-0">
      {stages.map((s, i) => {
        const reached = !rejected && currentIdx >= 0 && i <= currentIdx;
        const isCurrent = s === current;
        return (
          <li key={s} className="flex gap-3">
            <span className="flex flex-col items-center" aria-hidden>
              <span
                className={
                  reached
                    ? "mt-1 h-2.5 w-2.5 rounded-full bg-primary"
                    : "mt-1 h-2.5 w-2.5 rounded-full bg-border-strong"
                }
              />
              {i < stages.length - 1 ? <span className="h-5 w-px bg-border" /> : null}
            </span>
            <span className={isCurrent ? "pb-4 text-sm font-semibold text-foreground" : "pb-4 text-sm text-muted-foreground"}>
              {s}
              {isCurrent ? " · current" : ""}
            </span>
          </li>
        );
      })}
      {rejected ? <li className="text-sm font-semibold text-danger">Rejected · closed</li> : null}
    </ol>
  );
}
