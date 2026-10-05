"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api";
import { CompanyTopShell } from "@/components/shell/company-top-shell";
import { PageContainer } from "@/components/shell/page-container";

function logout() {
  localStorage.removeItem("coditent_token");
  document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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
