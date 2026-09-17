"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FiArrowRight, FiBriefcase, FiCheckSquare, FiMessageSquare, FiSearch, FiUser } from "react-icons/fi";
import { api, getMe, getProfile, getRecommendations, listRecruitmentChats } from "@/lib/api";
import { PageContainer } from "@/components/shell/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/candidate/job-card";
import { ApplicationStage } from "@/components/candidate/application-stage";
import { NextActionCard, type NextAction } from "@/components/candidate/next-action-card";
import { getProfileCompletion } from "@/components/candidate/profile-completion";
import type { ApplicationItem } from "@/lib/types";
import styles from "@/components/candidate/candidate-pages.module.css";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

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
  const profile = profileQuery.data;
  const recs = recsQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const chats = chatsQuery.data ?? [];
  const loading = meQuery.isLoading || profileQuery.isLoading || recsQuery.isLoading || appsQuery.isLoading;

  const firstName = (me?.full_name ?? "").split(" ")[0] || null;
  const completion = getProfileCompletion(profile, me?.avatar_url);

  const actions: NextAction[] = [];
  if (!profileQuery.isLoading && completion.missing.length > 0) {
    actions.push({
      icon: FiUser,
      title: "Complete your profile",
      context: `${completion.missing.length} ${completion.missing.length === 1 ? "detail" : "details"} to complete before your profile is ready.`,
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
  const doneCount = completion.done;
  const totalCount = completion.total;

  return (
    <PageContainer>
      <section className={styles.overviewHero} aria-labelledby="dashboard-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Your career space</p>
          <h1 id="dashboard-heading" className={styles.heroTitle}>
            {firstName ? `${greeting()}, ${firstName}.` : "Your next chapter starts here."}
          </h1>
          <p className={styles.heroDescription}>Pick up where you left off, explore opportunities, and keep every application in view.</p>
          <Link href="/dashboard/recommendations" className={styles.heroLink}>
            Explore opportunities <FiArrowRight aria-hidden />
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3" role="status" aria-label="Loading dashboard">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className={styles.dashboardFlow}>
          <section className={styles.journeyRail} aria-label="Your career at a glance">
            <Link href="/profile" className={styles.journeyItem}>
              <span>Profile</span>
              <strong>{Math.round((doneCount / totalCount) * 100)}%</strong>
              <p>{completion.missing.length ? `${completion.missing.length} ${completion.missing.length === 1 ? "detail" : "details"} left to add` : "Your profile is complete"}</p>
              <div className={styles.statusProgress} role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label="Profile completion"><span style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} /></div>
            </Link>
            <Link href="/dashboard/applications" className={styles.journeyItem}>
              <span>Applications</span><strong>{apps.length}</strong><p>Track each stage and next step</p>
            </Link>
            <Link href="/chat" className={styles.journeyItem}>
              <span>Conversations</span><strong>{chats.length}</strong><p>Messages about your applications</p>
            </Link>
          </section>

          <section aria-label="Next actions">
            <div className={styles.sectionHeading}><h2>What needs your attention</h2></div>
            {nextActions.length === 0 ? <div className={styles.quietNotice}><p>Nothing urgent right now. Discover a role that fits your next move.</p><Link href="/dashboard/recommendations">Explore roles <FiArrowRight aria-hidden /></Link></div> : (
              <div className={styles.actionGrid}>{nextActions.map((action) => <NextActionCard key={action.title} action={action} />)}</div>
            )}
          </section>

          <section aria-label="Recommended for you">
            <div className={styles.sectionHeading}><h2>Opportunities to explore</h2><Link href="/dashboard/recommendations" className={styles.sectionLink}>View all <FiArrowRight aria-hidden /></Link></div>
            {topRecs.length === 0 ? <EmptyState title="No opportunities yet" description="Analyze matches in Discover to see relevant roles here." primaryAction={{ label: "Open Discover", href: "/dashboard/recommendations" }} /> : (
              <div className={styles.recommendationGrid}>{topRecs.map((recommendation) => <JobCard key={recommendation.id} rec={recommendation} applied={appliedIds.has(recommendation.offer.id)} href={`/dashboard/recommendations?offer=${recommendation.offer.id}`} />)}</div>
            )}
          </section>

          <section aria-label="Application activity">
            <div className={styles.sectionHeading}><h2>Application activity</h2><Link href="/dashboard/applications" className={styles.sectionLink}>Open tracker <FiArrowRight aria-hidden /></Link></div>
            {recentApps.length === 0 ? <EmptyState icon={FiBriefcase} title="No applications yet" description="Applied roles appear here with their latest stage." primaryAction={{ label: "Discover opportunities", href: "/dashboard/recommendations" }} /> : (
              <ul className={styles.activityList}>{recentApps.map((application) => <li key={application.id}><Link href={`/dashboard/applications?app=${application.id}`}><span><strong>{application.opportunity?.title ?? "Application"}</strong><small>{application.opportunity?.company ?? ""}{application.updated_at ? ` · Updated ${new Date(application.updated_at).toLocaleDateString()}` : ""}</small></span><ApplicationStage status={application.status} /><FiArrowRight aria-hidden className={styles.activityArrow} /></Link></li>)}</ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
