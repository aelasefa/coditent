import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { offerLogoSrc } from "@/lib/api";
import { ApplicationStage, nextStepFor, stageLabel } from "./application-stage";
import type { ApplicationItem, RecruitmentChatListItem } from "@/lib/types";
import styles from "./applications.module.css";

export function formatApplicationDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function applicationName(app: ApplicationItem, chat?: RecruitmentChatListItem | null) {
  return {
    title: chat?.offer_title ?? app.opportunity?.title ?? "Application",
    company: chat?.company_name ?? app.opportunity?.company ?? "Company",
  };
}

export function ApplicationCard({ app, chat, selected, pathname }: { app: ApplicationItem; chat?: RecruitmentChatListItem | null; selected: boolean; pathname: string }) {
  const { title, company } = applicationName(app, chat);
  const status = applicationStatusInfo(app.status);
  const updated = formatApplicationDate(app.updated_at);

  return (
    <Card className={styles.applicationRow}>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {company ? (
              <Avatar
                name={company}
                size="md"
                src={offerLogoSrc({
                  company_id: app.opportunity?.company_id ?? chat?.company_id ?? null,
                  company_logo_url:
                    app.opportunity?.company_logo_url ?? chat?.company_logo_url ?? null,
                })}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {[company, appliedDate ? `Applied ${appliedDate}` : null].filter(Boolean).join(" · ") || stageLabel(app.status)}
              </p>
            </div>
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

const phases: Array<{ id: ApplicationPhase; label: string }> = [
  { id: "applied", label: "Applied" },
  { id: "review", label: "Review" },
  { id: "assessment", label: "Assessment" },
  { id: "interview", label: "Interview" },
  { id: "decision", label: "Decision" },
];

export function ApplicationTimeline({ status }: { status: string }) {
  const current = applicationStatusInfo(status).phase;
  return (
    <div className={styles.stageGuide}>
      <div className={styles.stageGuideHeading}><h3>Application path</h3><span>Possible stages</span></div>
      <ol aria-label="Possible application stages; only the current stage is known" className={styles.stageList}>
        {phases.map((phase) => (
          <li key={phase.id} className={phase.id === current ? styles.stageCurrent : ""}>
            <span className={styles.stageDot} aria-hidden />
            <span>{phase.label}</span>
            {phase.id === current ? <strong>Current</strong> : null}
          </li>
        ))}
      </ol>
      <p className={styles.stageNote}>Earlier stages are shown as a guide; their dates are not available in this tracker.</p>
    </div>
  );
}

export function ApplicationDetail({ app, chat, showTitle = true }: { app: ApplicationItem; chat?: RecruitmentChatListItem | null; showTitle?: boolean }) {
  const { title, company } = applicationName(app, chat);
  const status = applicationStatusInfo(app.status);
  const canMessage = Boolean(app.chat_enabled || chat);
  return (
    <div className={styles.detailContent}>
      {showTitle ? <div className={styles.detailHeader}>
        <span className={styles.detailEyebrow}>Application details</span>
        <h2>{title}</h2>
        <p>{company}</p>
      </div> : null}
      <section className={styles.currentStatus} aria-label="Current application status">
        <div className={styles.currentStatusTop}><span>Where things stand</span><ApplicationStage status={app.status} /></div>
        <p>{status.summary}</p>
      </section>
      <ApplicationTimeline status={app.status} />
      <section className={styles.nextStep} aria-label="What to do next">
        <h3>What to do next</h3>
        <p>{status.next}</p>
        {canMessage ? (
          <Link href={`/chat/recruitment/${encodeURIComponent(app.id)}`} className={styles.messageLink}>
            <FiMessageCircle aria-hidden /> Message recruiter
          </Link>
        ) : app.status === "rejected" ? (
          <Link href="/dashboard/recommendations" className={styles.messageLink}>Explore other roles <FiArrowUpRight aria-hidden /></Link>
        ) : (
          <span className={styles.chatNote}>Recruiter messaging is not available for this application yet.</span>
        )}
      </section>
      <dl className={styles.detailDates}>
        <div><dt>Applied</dt><dd>{formatApplicationDate(app.created_at) ?? "Date unavailable"}</dd></div>
        <div><dt>Last updated</dt><dd>{formatApplicationDate(app.updated_at) ?? "Date unavailable"}</dd></div>
      </dl>
    </div>
  );
}
