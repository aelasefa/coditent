"use client";

import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe } from "@/lib/api";
import { TwoFactorSecurity } from "@/components/security/two-factor-security";

export default function AdminSettingsPage() {
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader title="Settings" description="Signed-in platform administrator." />
        {meQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : meQ.isError ? (
          <p role="alert" className="text-sm font-medium text-danger">Could not load session.</p>
        ) : (
          <section aria-label="Session" className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-5">
            <Avatar name={meQ.data?.full_name || meQ.data?.email || "Admin"} size="lg" />
            <div>
              <p className="text-[15px] font-semibold text-foreground">{meQ.data?.full_name}</p>
              <p className="text-[13px] text-muted-foreground">{meQ.data?.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Role: {meQ.data?.role}</p>
            </div>
          </section>
        )}
        <section aria-label="Console notes" className="rounded-xl border border-border-subtle bg-surface p-5 text-sm text-foreground-secondary">
          <p>Company onboarding is invitation-only: create invites under Company Invitations. No public company registration exists.</p>
          <p className="mt-1">Legacy recruiter approvals remain under the recruiters route for pre-migration accounts.</p>
        </section>
        <TwoFactorSecurity />
      </div>
    </AdminShell>
  );
}
