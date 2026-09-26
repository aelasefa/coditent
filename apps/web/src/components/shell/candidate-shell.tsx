"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getMe } from "@/lib/api";
import { candidateOnboardingQuery } from "@/lib/candidate-onboarding";
import { PageContainer } from "./page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateTopShell } from "./candidate-top-shell";

function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("coditent_token");
    document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  }
}

export function CandidateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const { data: me } = meQuery;
  const onboardingQuery = useQuery({
    ...candidateOnboardingQuery(me?.id ?? "pending"),
    enabled: me?.role === "CANDIDATE",
  });
  const onboarding = onboardingQuery.data;

  useEffect(() => {
    if (onboarding && !onboarding.onboarding_completed) router.replace("/get-started");
  }, [onboarding, router]);

  const isCheckingCandidate =
    meQuery.isLoading ||
    (me?.role === "CANDIDATE" && onboardingQuery.isLoading) ||
    onboarding?.onboarding_completed === false;

  if (isCheckingCandidate) {
    return <CandidateShellLoading me={me} />;
  }

  if (meQuery.isError || (me?.role === "CANDIDATE" && onboardingQuery.isError)) {
    return (
      <div className="candidate-theme">
        <CandidateTopShell user={{ name: me?.full_name || "Candidate", email: me?.email, avatarUrl: me?.avatar_url }} onLogout={logout}>
          <PageContainer>
            <div role="alert" className="rounded-2xl border border-border bg-surface p-6">
              <h1 className="text-xl font-semibold text-foreground">We couldn’t prepare your workspace</h1>
              <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
              <button
                type="button"
                className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                onClick={() => void (meQuery.isError ? meQuery.refetch() : onboardingQuery.refetch())}
              >
                Try again
              </button>
            </div>
          </PageContainer>
        </CandidateTopShell>
      </div>
    );
  }

  return (
    <div className="candidate-theme">
    <CandidateTopShell
      user={{
        name: me?.full_name || "Candidate",
        email: me?.email,
        avatarUrl: me?.avatar_url,
      }}
      onLogout={logout}
    >
      {children}
    </CandidateTopShell>
    </div>
  );
}

function CandidateShellLoading({ me }: { me: Awaited<ReturnType<typeof getMe>> | undefined }) {
  return (
    <div className="candidate-theme">
      <CandidateTopShell
        user={{ name: me?.full_name || "Candidate", email: me?.email, avatarUrl: me?.avatar_url }}
        onLogout={logout}
      >
        <PageContainer>
          <div role="status" aria-live="polite" className="space-y-5">
            <span className="text-sm font-medium text-muted-foreground">Preparing your workspace…</span>
            <Skeleton className="h-12 w-64 max-w-full" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          </div>
        </PageContainer>
      </CandidateTopShell>
    </div>
  );
}
