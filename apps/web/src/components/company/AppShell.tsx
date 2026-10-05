"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api";
import { CompanyTopShell } from "@/components/shell/company-top-shell";
import { PageContainer } from "@/components/shell/page-container";
import { isCompanyPreviewEnabled } from "@/lib/company-preview";

function logout() {
  localStorage.removeItem("coditent_token");
  document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  window.location.href = "/login";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const preview = isCompanyPreviewEnabled();
  return (
    <div className="company-theme">
      <CompanyTopShell user={{ name: me?.full_name || "Recruiter", email: me?.email, avatarUrl: me?.avatar_url }} onLogout={logout}>
        <PageContainer>
          {preview ? (
            <div role="status" className="mb-4 rounded-xl border border-warning/30 bg-warning-background px-4 py-3 text-sm text-foreground-secondary">
              <strong className="text-foreground">Company UI preview</strong> — local sample data; login and backend calls are disabled.
            </div>
          ) : null}
          {children}
        </PageContainer>
      </CompanyTopShell>
    </div>
  );
}
