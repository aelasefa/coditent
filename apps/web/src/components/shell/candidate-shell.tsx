"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getMe } from "@/lib/api";
import { candidateOnboardingQuery } from "@/lib/candidate-onboarding";
import { CandidatePresence } from "@/components/candidate/candidate-presence";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { logoutAndRedirect } from "@/lib/logout-flow";
import { PageContainer } from "./page-container";
import { CandidateTopShell } from "./candidate-top-shell";

export function CandidateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const { data: me } = meQuery;
  const onboardingQuery = useQuery({
    ...candidateOnboardingQuery(me?.id ?? "pending"),
    enabled: me?.role === "CANDIDATE",
  });
  const onboarding = onboardingQuery.data;
  const logout = () => logoutAndRedirect({ endCandidatePresence: true });

  useEffect(() => {
    if (onboarding && !onboarding.onboarding_completed) router.replace("/get-started");
  }, [onboarding, router]);

  const isCheckingCandidate =
    meQuery.isLoading ||
    (me?.role === "CANDIDATE" && onboardingQuery.isLoading) ||
    onboarding?.onboarding_completed === false;

  if (isCheckingCandidate) {
    return <CandidateShellLoading me={me} onLogout={logout} />;
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
      <CandidatePresence />
      {children}
    </CandidateTopShell>
    </div>
  );
}

function CandidateShellLoading({
  me,
  onLogout,
}: {
  me: Awaited<ReturnType<typeof getMe>> | undefined;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="candidate-theme">
      <CandidateTopShell
        user={{ name: me?.full_name || "Candidate", email: me?.email, avatarUrl: me?.avatar_url }}
        onLogout={onLogout}
      >
        <LoadingSpinner
          className="min-h-[calc(100dvh-90px)] max-[900px]:min-h-[calc(100dvh-76px)]"
          size="large"
          placement="center"
          label="Preparing your workspace"
        />
      </CandidateTopShell>
    </div>
  );
}
