import { endPresence, getPresenceConnectionId, logoutSession } from "@/lib/api";

type LogoutOptions = {
  redirectTo?: string;
  endCandidatePresence?: boolean;
};

export async function logoutAndRedirect({
  redirectTo = "/login",
  endCandidatePresence = false,
}: LogoutOptions = {}): Promise<void> {
  const operations: Promise<unknown>[] = [logoutSession()];

  if (endCandidatePresence) {
    operations.push(endPresence(getPresenceConnectionId()));
  }

  await Promise.allSettled(operations);
  window.location.replace(redirectTo);
}
