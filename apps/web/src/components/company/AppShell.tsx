"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe, logoutSession } from "@/lib/api";
import { CompanyTopShell } from "@/components/shell/company-top-shell";
import { PageContainer } from "@/components/shell/page-container";

async function logout() {
  await logoutSession().catch(() => undefined);
  window.location.href = "/login";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  return (
    <div className="company-theme">
      <CompanyTopShell user={{ name: me?.full_name || "Recruiter", email: me?.email, avatarUrl: me?.avatar_url }} onLogout={logout}>
        <PageContainer>
          {children}
        </PageContainer>
      </CompanyTopShell>
    </div>
  );
}
