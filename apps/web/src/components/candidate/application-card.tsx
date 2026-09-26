import Link from "next/link";
import { FiArrowUpRight, FiMessageCircle } from "react-icons/fi";
import { Avatar } from "@/components/ui/avatar";
import { offerLogoSrc } from "@/lib/api";
import { ApplicationStage, applicationStatusInfo, type ApplicationPhase } from "./application-stage";
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

function applicationCompanyId(app: ApplicationItem, chat?: RecruitmentChatListItem | null) {
  return app.opportunity?.company_id ?? chat?.company_id ?? app.company_id ?? null;
}

function applicationLogoSrc(app: ApplicationItem, chat?: RecruitmentChatListItem | null) {
  return offerLogoSrc({
    company_id: applicationCompanyId(app, chat),
    company_logo_url: app.opportunity?.company_logo_url ?? chat?.company_logo_url ?? null,
  });
}

export function ApplicationCard({ app, chat, selected, pathname }: { app: ApplicationItem; chat?: RecruitmentChatListItem | null; selected: boolean; pathname: string }) {
  const { title, company } = applicationName(app, chat);
  const status = applicationStatusInfo(app.status);
  const updated = formatApplicationDate(app.updated_at);

  return (
    <Link
      href={`${pathname}?app=${encodeURIComponent(app.id)}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={`${styles.applicationRow} ${selected ? styles.applicationRowSelected : ""}`}
    >
      <span className={styles.rowTop}>
        <span className={styles.rowIdentity}>
          <Avatar name={company} size="md" src={applicationLogoSrc(app, chat)} />
          <span className={styles.rowCompany}>{company}</span>
        </span>
        <FiArrowUpRight aria-hidden className={styles.rowArrow} />
      </span>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.rowStatus}><ApplicationStage status={app.status} /><span>{status.summary}</span></span>
      <span className={styles.rowMeta}>
        <span>{formatApplicationDate(app.created_at) ? `Applied ${formatApplicationDate(app.created_at)}` : "Application submitted"}</span>
        {updated ? <span>Updated {updated}</span> : null}
      </span>
    </Link>
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
  const companyId = applicationCompanyId(app, chat);
  return (
    <div className={styles.detailContent}>
      <div className={styles.detailHeader}>
        {showTitle ? <><span className={styles.detailEyebrow}>Application details</span><h2>{title}</h2></> : null}
        <div className={styles.detailCompany}>
          <Avatar name={company} size="lg" src={applicationLogoSrc(app, chat)} />
          <div>
            <p>{company}</p>
            {companyId ? <Link href={`/dashboard/companies/${encodeURIComponent(companyId)}?app=${encodeURIComponent(app.id)}`} className={styles.companyProfileLink}>View company profile <FiArrowUpRight aria-hidden="true" /></Link> : null}
          </div>
        </div>
      </div>
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
