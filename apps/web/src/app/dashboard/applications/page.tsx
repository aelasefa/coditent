"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { FiBriefcase } from "react-icons/fi";
import { api, listRecruitmentChats, offerLogoSrc } from "@/lib/api";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { ApplicationCard, ApplicationTimeline } from "@/components/candidate/application-card";
import { mapStatusToStage, nextStepFor, stageLabel } from "@/components/candidate/application-stage";
import type { ApplicationItem } from "@/lib/types";

export default function CandidateApplicationsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Loading applications</p>}>
      <ApplicationsContent />
    </Suspense>
  );
}

function ApplicationsContent() {
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
      return data.applications;
    },
  });
  const chatsQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });

  return (
    <PageContainer>
      <div className={styles.pageIntro}><h1>My applications</h1><p>Follow each role from application through the next decision.</p></div>

      <div className={styles.applicationFilters} role="group" aria-label="Filter applications">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = apps.filter((a) => matches(a, f.id)).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={active ? styles.applicationFilterActive : styles.applicationFilter}
            >
              <strong>{count}</strong><span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3" role="status" aria-label="Loading applications">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-background p-4">
          <p className="text-sm font-semibold text-danger">Could not load applications.</p>
          <button type="button" onClick={() => appsQuery.refetch()} className="mt-2 text-sm font-semibold text-danger underline">
            Retry
          </button>
        </div>
      ) : visible.length === 0 && apps.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={FiBriefcase}
            title="No applications yet"
            description="Jobs you apply to appear here so you can track every step."
            primaryAction={{ label: "Discover opportunities", href: "/dashboard/recommendations" }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing in this view"
            description="No applications match this filter right now."
            primaryAction={{ label: "Show all", onClick: () => setFilter("all") }}
          />
        </div>
      ) : (
        <ul className={styles.applicationList} aria-label="Applications">
          {visible.map((app) => (
            <li key={app.id}>
              <ApplicationCard app={app} chat={chatByApp.get(app.id)} />
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={Boolean(detailOpen && detail)}
        onClose={() => setDetailOpen(false)}
        title={detailChat?.offer_title ?? detail?.opportunity?.title ?? "Application"}
        description={detail ? stageLabel(detail.status) : undefined}
        side="right"
        size="md"
      >
        {detail ? (
          <div>
            <div className="flex items-center gap-3">
              <Avatar
                name={detailChat?.company_name ?? detail.opportunity?.company ?? "Company"}
                size="lg"
                src={offerLogoSrc({
                  company_id: detail.opportunity?.company_id ?? detailChat?.company_id ?? null,
                  company_logo_url: detail.opportunity?.company_logo_url ?? detailChat?.company_logo_url ?? null,
                })}
              />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {[detailChat?.company_name ?? detail.opportunity?.company ?? null, detail.created_at ? `Applied ${new Date(detail.created_at).toLocaleDateString()}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <ApplicationTimeline status={detail.status} />
            <section aria-label="Next step" className="mt-4 rounded-xl border border-border-subtle bg-surface-secondary/40 p-4">
              <h3 className="text-sm font-semibold text-foreground">Next step</h3>
              <p className="mt-1 text-sm text-foreground-secondary">{nextStepFor(detail.status)}</p>
              {(detail.chat_enabled || detailChat) ? (
                <a
                  href={`/chat/recruitment/${detail.id}`}
                  className="mt-3 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Message recruiter
                </a>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">Chat opens after recruiter advances your application.</p>
              )}
            </section>
          </div>
        ) : null}
      </Sheet>
    </PageContainer>
  );
}
