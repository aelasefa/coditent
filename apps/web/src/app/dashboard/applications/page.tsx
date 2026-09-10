"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { FiBriefcase } from "react-icons/fi";
import { api, listRecruitmentChats } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { ApplicationCard, ApplicationTimeline } from "@/components/candidate/application-card";
import { mapStatusToStage, nextStepFor, stageLabel } from "@/components/candidate/application-stage";
import type { ApplicationItem } from "@/lib/types";

type Filter = "all" | "active" | "assessment" | "interview" | "offers" | "closed";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "assessment", label: "Assessment" },
  { id: "interview", label: "Interview" },
  { id: "offers", label: "Offers" },
  { id: "closed", label: "Closed" },
];

function matches(app: ApplicationItem, f: Filter): boolean {
  const stage = mapStatusToStage(app.status);
  switch (f) {
    case "all":
      return true;
    case "active":
      return stage !== "Offer" && stage !== "Rejected";
    case "assessment":
      return stage === "Assessment";
    case "interview":
      return stage === "Interview";
    case "offers":
      return stage === "Offer";
    case "closed":
      return stage === "Rejected";
  }
}

export default function CandidateApplicationsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Loading applications</p>}>
      <ApplicationsContent />
    </Suspense>
  );
}

function ApplicationsContent() {
  const searchParams = useSearchParams();
  const detailId = searchParams.get("app");
  const [filter, setFilter] = useState<Filter>("all");
  const [detailOpen, setDetailOpen] = useState(Boolean(detailId));

  useEffect(() => {
    if (detailId) setDetailOpen(true);
  }, [detailId]);

  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
      return data.applications;
    },
  });
  const chatsQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });

  const apps = appsQuery.data ?? [];
  const chatByApp = useMemo(() => new Map((chatsQuery.data ?? []).map((c) => [c.application_id, c])), [chatsQuery.data]);
  const visible = apps.filter((a) => matches(a, filter));
  const detail = apps.find((a) => a.id === detailId) ?? null;
  const detailChat = detail ? chatByApp.get(detail.id) : null;
  const loading = appsQuery.isLoading;
  const error = appsQuery.isError;

  return (
    <PageContainer>
      <PageHeader title="My Applications" description="Every application, current stage and next step." />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter applications">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = apps.filter((a) => matches(a, f.id)).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground"
                  : "rounded-full bg-surface-secondary px-3.5 py-1.5 text-[13px] font-medium text-foreground-secondary hover:bg-surface-hover"
              }
            >
              {f.label} · {count}
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
        <ul className="mt-4 space-y-3" aria-label="Applications">
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
            <p className="text-sm text-muted-foreground">
              {[detailChat?.company_name ?? detail.opportunity?.company ?? null, detail.created_at ? `Applied ${new Date(detail.created_at).toLocaleDateString()}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
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
