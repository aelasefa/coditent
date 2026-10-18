"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getMe, logoutSession } from "@/lib/api";
import { CompanyTopShell } from "@/components/shell/company-top-shell";
import { PageContainer } from "@/components/shell/page-container";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const logout = async () => {
    await logoutSession().catch(() => undefined);
    router.replace("/login");
  };
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
