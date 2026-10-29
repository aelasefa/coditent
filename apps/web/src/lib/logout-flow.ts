import { endPresence, getPresenceConnectionId, logoutSession } from "@/lib/api";

type LogoutOptions = {
  redirectTo?: string;
  endCandidatePresence?: boolean;
};

export async function logoutAndRedirect({
  redirectTo = "/login",
  endCandidatePresence = false,
}: LogoutOptions = {}): Promise<void> {
  const sessionRevocation = logoutSession();
  if (endCandidatePresence) {
    // Presence is advisory and expires automatically. Do not make secure
    // session revocation or navigation wait for this best-effort cleanup.
    void endPresence(getPresenceConnectionId()).catch(() => undefined);
  }
  try {
    await sessionRevocation;
  } catch {
    // logoutSession always clears local credentials. Redirect even when the
    // server is unavailable so the browser never remains visibly signed in.
  }
  window.location.replace(redirectTo);
}
