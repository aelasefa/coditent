import type { QueryClient } from "@tanstack/react-query";
import { getAuthenticatedDestination } from "@/lib/auth-redirect";
import { getCandidateOnboarding } from "@/lib/api";
import type { User } from "@/lib/types";

export const candidateOnboardingQuery = (userId: string) => ({
  queryKey: ["candidate-onboarding", userId] as const,
  queryFn: getCandidateOnboarding,
  staleTime: 60_000,
});

export async function getPostAuthDestination(
  queryClient: QueryClient,
  user: User,
  options: { next?: string | null; isNewRegistration?: boolean } = {}
): Promise<string> {
  queryClient.setQueryData(["me"], user);

  if (user.role === "CANDIDATE") {
    try {
      const onboarding = await queryClient.fetchQuery(
        candidateOnboardingQuery(user.id)
      );
      if (!onboarding.onboarding_completed) return "/get-started";
    } catch {
      // Authentication has already succeeded. A transient onboarding lookup
      // must not turn a valid, consumed MFA challenge into a login failure.
      // CandidateShell retries this query and redirects incomplete profiles.
      return getAuthenticatedDestination(user, options);
    }
  }

  return getAuthenticatedDestination(user, options);
}
