"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { stageLabel } from "./application-stage";
import { getCompany } from "@/lib/api";
import styles from "./chat-participant-profile.module.css";

export type ChatParticipantProfile = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  companyRole?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  opportunityTitle?: string | null;
  applicationStatus?: string | null;
  email?: string | null;
};

const companyRoleLabels: Record<string, string> = {
  OWNER: "Company owner",
  ADMIN: "Company administrator",
  HR: "Human resources",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
};

const roleLabels: Record<string, string> = {
  CANDIDATE: "Candidate",
  COMPANY_USER: "Company member",
  RECRUITER: "Recruiter",
  ADMIN: "Administrator",
  PLATFORM_ADMIN: "Platform administrator",
};

export function getChatRoleLabel(role?: string | null, companyRole?: string | null): string {
  return (companyRole && companyRoleLabels[companyRole]) || (role && roleLabels[role]) || "Conversation participant";
}

function websiteUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function ChatParticipantProfileContent({
  profile,
  active,
}: {
  profile: ChatParticipantProfile;
  active: boolean;
}) {
  const companyQuery = useQuery({
    queryKey: ["company", profile.companyId],
    queryFn: () => getCompany(profile.companyId!),
    enabled: active && Boolean(profile.companyId),
    staleTime: 60_000,
    retry: false,
  });
  const company = companyQuery.data;
  const companyName = profile.companyName || company?.name;
  const website = websiteUrl(company?.website);
  const location = company?.location || company?.region;
  const hasCompanyContact = Boolean(company?.contact_email || company?.contact_phone || website);
  const hasCompanyDetails = Boolean(company?.description || company?.industry || location);
  const applicationStatus = profile.applicationStatus && stageLabel(profile.applicationStatus);

  return (
    <div className={styles.content}>
      <div className={styles.identity}>
        <Avatar name={profile.name} src={profile.avatarUrl} size="xl" className={styles.avatar} />
        <h3 className={styles.name}>{profile.name}</h3>
        <p className={styles.role}>{getChatRoleLabel(profile.role, profile.companyRole)}</p>
        {companyName ? <p className={styles.companyName}>{companyName}</p> : null}
      </div>

      {profile.opportunityTitle || applicationStatus ? (
        <section className={styles.section} aria-label="Recruitment details">
          <h3 className={styles.sectionTitle}>Recruitment details</h3>
          <dl className={styles.details}>
            {profile.opportunityTitle ? (
              <div>
                <dt>Opportunity</dt>
                <dd>{profile.opportunityTitle}</dd>
              </div>
            ) : null}
            {applicationStatus ? (
              <div>
                <dt>Application stage</dt>
                <dd>{applicationStatus}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {profile.email ? (
        <section className={styles.section} aria-label="Contact">
          <h3 className={styles.sectionTitle}>Contact</h3>
          <dl className={styles.details}>
            <div>
              <dt>Email</dt>
              <dd><a className={styles.link} href={`mailto:${encodeURIComponent(profile.email)}`}>{profile.email}</a></dd>
            </div>
          </dl>
        </section>
      ) : null}

      {profile.companyId ? (
        <section className={styles.section} aria-label="Company details">
          <h3 className={styles.sectionTitle}>Company details</h3>
          {companyQuery.isPending ? (
            <p className={styles.notice} role="status">Loading company details…</p>
          ) : companyQuery.isError && !company ? (
            <div className={styles.error}>
              <p className={styles.notice} role="status">Company details could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" loading={companyQuery.isFetching} onClick={() => void companyQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : company ? (
            <>
              {company.description ? <p className={styles.description}>{company.description}</p> : null}
              {company.industry || location ? (
                <dl className={styles.details}>
                  {company.industry ? <div><dt>Industry</dt><dd>{company.industry}</dd></div> : null}
                  {location ? <div><dt>Location</dt><dd>{location}</dd></div> : null}
                </dl>
              ) : null}
              {hasCompanyContact ? (
                <dl className={styles.details}>
                  {company.contact_email ? (
                    <div>
                      <dt>Company email</dt>
                      <dd><a className={styles.link} href={`mailto:${encodeURIComponent(company.contact_email)}`}>{company.contact_email}</a></dd>
                    </div>
                  ) : null}
                  {company.contact_phone ? (
                    <div>
                      <dt>Company phone</dt>
                      <dd><a className={styles.link} href={`tel:${encodeURIComponent(company.contact_phone)}`}>{company.contact_phone}</a></dd>
                    </div>
                  ) : null}
                  {website ? (
                    <div>
                      <dt>Company website</dt>
                      <dd><a className={styles.link} href={website} target="_blank" rel="noopener noreferrer">{website.replace(/^https?:\/\//, "").replace(/\/$/, "")}<span className="sr-only"> (opens in a new tab)</span></a></dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {!hasCompanyDetails && !hasCompanyContact ? <p className={styles.notice}>No additional company details have been shared.</p> : null}
              {hasCompanyDetails && !hasCompanyContact ? <p className={styles.notice}>Company contact details have not been shared.</p> : null}
            </>
          ) : null}
        </section>
      ) : !profile.email ? (
        <section className={styles.section} aria-label="Contact">
          <h3 className={styles.sectionTitle}>Contact</h3>
          <p className={styles.notice}>Contact details have not been shared.</p>
        </section>
      ) : null}
    </div>
  );
}
