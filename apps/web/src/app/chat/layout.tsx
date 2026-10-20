"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CandidateShell } from "@/components/shell/candidate-shell";
import { CompanyTopShell } from "@/components/shell/company-top-shell";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getMe, logoutSession } from "@/lib/api";
import { chatWorkspaceIdentity } from "@/lib/chat-workspace-identity";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const me = meQuery.data;
  const logout = async () => {
    await logoutSession().catch(() => undefined);
    router.replace("/login");
  };

  // Wait for the authenticated role instead of flashing candidate navigation.
  if (meQuery.isPending) {
    return <LoadingSpinner size="large" placement="page" label="Preparing your workspace" />;
  }
  if (meQuery.isError || !me) {
    return <div role="alert" className="p-6">
      <p>We couldn’t prepare your workspace.</p>
      <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => void meQuery.refetch()}>Try again</button>
    </div>;
  }

  if (chatWorkspaceIdentity(me.role).isCompany) {
    return <div className="company-theme">
      <CompanyTopShell user={{ name: me.full_name || "Recruiter", email: me.email, avatarUrl: me.avatar_url }} onLogout={logout}>
        {children}
      </CompanyTopShell>
    </div>;
  }
  return <CandidateShell>{children}</CandidateShell>;
}
