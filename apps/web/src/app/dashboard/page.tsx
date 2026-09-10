"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FiArrowRight, FiBriefcase, FiCheckSquare, FiMessageSquare, FiSearch, FiUser } from "react-icons/fi";
import { api, getMe, getProfile, getRecommendations, listRecruitmentChats } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/candidate/job-card";
import { ApplicationStage, stageLabel } from "@/components/candidate/application-stage";
import { NextActionCard, type NextAction } from "@/components/candidate/next-action-card";
import type { ApplicationItem } from "@/lib/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const PROFILE_FIELDS = [
  { key: "headline", label: "Headline" },
  { key: "bio", label: "Bio" },
  { key: "skills", label: "Skills" },
  { key: "city", label: "City" },
  { key: "phone", label: "Phone" },
  { key: "field_of_study", label: "Field of study" },
  { key: "university", label: "University" },
  { key: "study_level", label: "Study level" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "portfolio_url", label: "Portfolio" },
] as const;

export default function DashboardPage() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, staleTime: 60_000 });
  const recsQuery = useQuery({ queryKey: ["recommendations"], queryFn: getRecommendations });
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
      return data.applications;
    },
  });
  const chatsQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });

  const me = meQuery.data;
  const profile = (profileQuery.data ?? {}) as Record<string, unknown>;
  const recs = recsQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const chats = chatsQuery.data ?? [];
  const loading = meQuery.isLoading || profileQuery.isLoading || recsQuery.isLoading || appsQuery.isLoading;

  const firstName = (me?.full_name ?? "").split(" ")[0] || null;
  const missingProfile = PROFILE_FIELDS.filter((f) => {
    const v = profile[f.key];
    return v == null || String(v).trim() === "";
  });
  const hasCv = Boolean((profile as { cv_url?: string | null }).cv_url);

  const actions: NextAction[] = [];
  if (!profileQuery.isLoading && (missingProfile.length > 0 || !hasCv)) {
    actions.push({
      icon: FiUser,
      title: "Complete your profile",
      context: `${missingProfile.length + (hasCv ? 0 : 1)} items missing. Strong profiles get better matches.`,
      cta: "Open profile",
      href: "/profile",
    });
  }
  const assessmentApps = apps.filter((a) => a.status === "assessment_required");
  if (assessmentApps.length > 0) {
    actions.push({
      icon: FiCheckSquare,
      title: "Assessment requested",
      context: `${assessmentApps.length} application${assessmentApps.length > 1 ? "s" : ""} waiting on assessment stage.`,
      cta: "View applications",
      href: "/dashboard/applications",
    });
  }
  if (!recsQuery.isLoading && recs.length === 0) {
    actions.push({
      icon: FiSearch,
      title: "Review new recommendations",
      context: "Generate matches by field and region.",
      cta: "Open Discover",
      href: "/dashboard/recommendations",
    });
  }
  if (chats.length > 0) {
    const latest = [...chats].sort((a, b) => String(b.last_at ?? "").localeCompare(String(a.last_at ?? "")))[0];
    if (latest?.last_message) {
      actions.push({
        icon: FiMessageSquare,
        title: "Recruiter message",
        context: `${latest.offer_title} · ${latest.peer?.full_name ?? "Recruiter"}`,
        cta: "Open messages",
        href: "/chat",
      });
    }
  }
  const nextActions = actions.slice(0, 4);

  const topRecs = [...recs]
    .sort((a, b) => (b.score ?? b.ai_score ?? 0) - (a.score ?? a.ai_score ?? 0))
    .slice(0, 3);
  const appliedIds = new Set(apps.map((a) => a.opportunity_id));
  const recentApps = [...apps]
    .sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")))
    .slice(0, 4);
  const doneCount = PROFILE_FIELDS.length + 1 - missingProfile.length - (hasCv ? 0 : 1);
  const totalCount = PROFILE_FIELDS.length + 1;

  return (
    <PageContainer>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : "Your career dashboard"}
        description="Next actions, best matches and recent application activity."
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-8">
            <section aria-label="Next actions">
              <h2 className="ct-section-title">Next actions</h2>
              {nextActions.length === 0 ? (
                <Card className="mt-3">
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Nothing urgent. Explore new opportunities.</p>
                    <Link href="/dashboard/recommendations" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                      Open Discover
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {nextActions.map((a) => (
                    <NextActionCard key={a.title} action={a} />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Recommended for you">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="ct-section-title">Recommended for you</h2>
                <Link href="/dashboard/recommendations" className="text-[13px] font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              {topRecs.length === 0 ? (
                <EmptyState
                  title="No recommendations yet"
                  description="Generate matches from Discover to see top picks here."
                  primaryAction={{ label: "Open Discover", href: "/dashboard/recommendations" }}
                />
              ) : (
                <div className="mt-3 space-y-3">
                  {topRecs.map((r) => (
                    <JobCard
                      key={r.id}
                      rec={r}
                      applied={appliedIds.has(r.offer.id)}
                      href={`/dashboard/recommendations?offer=${r.offer.id}`}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-8">
            <section aria-label="Application activity">
              <h2 className="ct-section-title">Application activity</h2>
              {recentApps.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    icon={FiBriefcase}
                    title="No applications yet"
                    description="Jobs you apply to appear here with stage updates."
                    primaryAction={{ label: "Discover opportunities", href: "/dashboard/recommendations" }}
                  />
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {recentApps.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {a.opportunity?.title ?? "Application"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.opportunity?.company ?? ""} {a.updated_at ? `· ${new Date(a.updated_at).toLocaleDateString()}` : ""}
                        </span>
                      </span>
                      <ApplicationStage status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              {apps.length > 0 ? (
                <Link href="/dashboard/applications" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                  Open tracker <FiArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </section>

            <section aria-label="Profile readiness">
              <h2 className="ct-section-title">Profile readiness</h2>
              <Card className="mt-3">
                <CardContent>
                  <p className="text-sm font-semibold text-foreground">
                    {doneCount} of {totalCount} complete
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label="Profile completion">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
                  </div>
                  {missingProfile.length > 0 ? (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      Missing: {missingProfile.slice(0, 4).map((f) => f.label).join(", ")}
                      {missingProfile.length > 4 ? ` +${missingProfile.length - 4} more` : ""}
                      {hasCv ? "" : `${missingProfile.length > 0 ? ", " : ""}CV`}
                    </p>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">Profile basics complete. Current stage: {apps.length > 0 ? stageLabel(apps[0].status) : "exploring"}.</p>
                  )}
                  <Link href="/profile" className="mt-2 inline-block text-[13px] font-semibold text-primary hover:underline">
                    Improve profile
                  </Link>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
