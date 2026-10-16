"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { getMe, inviteEmployee, listEmployeeInvitations, revokeEmployeeInvitation, resendEmployeeInvite } from "@/lib/api";
import { can } from "@/lib/permissions";
import type { EmployeeInvitation } from "@/lib/types";
import { FiMail, FiShield } from "react-icons/fi";

function inviteStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "PENDING") return "Pending";
  if (s === "ACCEPTED") return "Accepted";
  if (s === "EXPIRED") return "Expired";
  if (s === "REVOKED") return "Revoked";
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CompanyInvitationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canInvite = can(me ?? null, "invite_employees");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-invites"],
    queryFn: listEmployeeInvitations,
    enabled: canInvite,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECRUITER");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [revokeTarget, setRevokeTarget] = useState<EmployeeInvitation | null>(null);
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({});

  async function copyLink(invitationId: string) {
    const url = issuedUrls[invitationId];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invitation link copied", { variant: "success" });
    } catch {
      toast("Copy failed", { description: url, variant: "error" });
    }
  }

  const inviteMut = useMutation({
    mutationFn: () => {
      if (!email.trim() || !email.includes("@")) throw new Error("Enter a valid work email address");
      return inviteEmployee({ email: email.trim(), role });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["employee-invites"] });
      setIssuedUrls((current) => ({ ...current, [result.invitation_id]: result.invitation_url }));
      setEmail("");
      setEmailError(undefined);
      const queued = ["pending", "processing", "retry"].includes(result.delivery_status);
      toast(result.email_sent ? "Invitation sent" : queued ? "Invitation queued" : "Invitation created, email not delivered", {
        description: result.email_sent
          ? "The provider accepted the registration email."
          : queued
            ? "Delivery will retry automatically. The manual link is also available."
            : result.email_error || "Copy the invitation link and share it securely.",
        variant: result.email_sent ? "success" : "warning",
      });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail || (e as Error)?.message || "Invite failed";
      if (String(msg).toLowerCase().includes("email")) setEmailError(String(msg));
      toast("Invite failed", { description: String(msg), variant: "error" });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeEmployeeInvitation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-invites"] });
      setRevokeTarget(null);
      toast("Invitation revoked", { variant: "success" });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Revoke failed";
      toast("Revoke failed", { description: String(msg), variant: "error" });
    },
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => resendEmployeeInvite(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["employee-invites"] });
      setIssuedUrls((current) => ({ ...current, [result.invitation_id]: result.invitation_url }));
      const queued = ["pending", "processing", "retry"].includes(result.delivery_status);
      toast(result.email_sent ? "New invitation sent" : queued ? "New invitation queued" : "New link created, email not delivered", {
        description: result.email_sent
          ? "The old link was invalidated."
          : queued
            ? "The old link was invalidated and delivery will retry automatically."
            : result.email_error || "Copy the new link and share it securely.",
        variant: result.email_sent ? "success" : "warning",
      });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Resend failed";
      toast("Resend failed", { description: String(msg), variant: "error" });
    },
  });

  const invitations = data?.invitations ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          tone="green"
          title="Invitations"
          subtitle="Invite colleagues by email. They register through the link and join this company."
        />

        {canInvite ? (
          <section aria-label="Send invitation" className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="ct-card-title">Invite team member</h2>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                inviteMut.mutate();
              }}
            >
              <Input label="Work email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" error={emailError} autoComplete="email" />
              <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="RECRUITER">Recruiter</option>
                <option value="HR">HR Specialist</option>
                <option value="HIRING_MANAGER">Hiring Manager</option>
                <option value="ADMIN">Admin</option>
              </Select>
              <Button type="submit" loading={inviteMut.isPending}>
                Send invite
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              The API reports invitation creation and email delivery separately. Owner role cannot be granted by invite.
            </p>
          </section>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning-background p-4 text-xs" role="note">
            <FiShield aria-hidden className="h-5 w-5 shrink-0 text-warning" />
            <p className="text-foreground-secondary"><strong className="text-foreground">Restricted.</strong> Only Owner or Admin can invite.</p>
          </div>
        )}

        <section aria-label="Sent invitations">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="ct-section-title">Sent invitations</h2>
            <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-primary">{invitations.length} sent</span>
          </div>
          {isLoading ? (
            <div className="mt-3"><TableSkeleton rows={4} cols={3} /></div>
          ) : isError ? (
            <div role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
              <p className="text-sm font-semibold text-danger">Could not load invitations.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
            </div>
          ) : invitations.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={FiMail} title="No invitations sent" description="Invite first teammate to start building hiring team." />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {invitations.map((inv) => {
                const pending = inv.status.toUpperCase() === "PENDING";
                return (
                  <li key={inv.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{inv.email}</p>
                      <StatusBadge status={inv.role} size="sm" showDot={false} />
                      <StatusBadge status={inviteStatusLabel(inv.status)} size="sm" />
                      {inv.email_delivery_status && <StatusBadge status={`email ${inv.email_delivery_status}`} size="sm" showDot={false} />}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                      </p>
                      {pending && canInvite ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" loading={resendMut.isPending} onClick={() => resendMut.mutate(inv.id)}>
                            Resend
                          </Button>
                          {issuedUrls[inv.id] && (
                            <Button size="sm" variant="ghost" onClick={() => copyLink(inv.id)}>
                              Copy link
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(inv)}>
                            Revoke
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{pending ? "" : "No actions available"}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <ConfirmDialog
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}
          title="Revoke invitation"
          message={`Cancel invitation to ${revokeTarget?.email}? Link becomes invalid immediately.`}
          confirmLabel="Revoke invitation"
          isLoading={revokeMut.isPending}
          isDestructive={true}
        />
      </div>
    </AppShell>
  );
}
