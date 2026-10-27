"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Modal } from "@/components/company/Modal";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { dismissCompanyInterest, inviteCompany, listCompanyInterest, listCompanyInvitations, resendCompanyInvitation, revokeCompanyInvitation } from "@/lib/api";
import type { CompanyInterestRequest, CompanyInvitation } from "@/lib/types";
import { FiInbox, FiMail, FiPlus } from "react-icons/fi";

function dateLabel(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function AdminCompanyInvitationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const invitesQ = useQuery({ queryKey: ["admin-company-invites"], queryFn: listCompanyInvitations });
  const interestQ = useQuery({ queryKey: ["admin-company-interest"], queryFn: listCompanyInterest });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [interestRequestId, setInterestRequestId] = useState<string>();
  const [revokeTarget, setRevokeTarget] = useState<CompanyInvitation | null>(null);
  const [form, setForm] = useState({ company_name: "", email: "", contact_name: "", contact_role: "" });
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({});

  const invites = useMemo(() => invitesQ.data?.invitations ?? [], [invitesQ.data]);
  const pendingInterest = useMemo(
    () => (interestQ.data?.requests ?? []).filter((request) => request.status === "pending"),
    [interestQ.data]
  );
  const filtered = useMemo(() => {
    let list = invites;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.company_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
    }
    return list;
  }, [invites, search, statusFilter]);

  const inviteMut = useMutation({
    mutationFn: () =>
      inviteCompany({
        company_name: form.company_name.trim(),
        email: form.email.trim(),
        contact_name: form.contact_name.trim() || undefined,
        contact_role: form.contact_role.trim() || undefined,
        interest_request_id: interestRequestId,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-company-invites"] });
      qc.invalidateQueries({ queryKey: ["admin-company-interest"] });
      if (res.invitation_url) setIssuedUrls((m) => ({ ...m, [res.invitation_id]: res.invitation_url }));
      setModalOpen(false);
      setInterestRequestId(undefined);
      setForm({ company_name: "", email: "", contact_name: "", contact_role: "" });
      setFormError(undefined);
      const queued = ["pending", "processing", "retry"].includes(res.delivery_status);
      toast(res.email_sent ? "Invitation sent" : queued ? "Invitation queued" : "Invitation created, email failed", {
        description: res.email_sent ? undefined : queued ? "Delivery will retry automatically; the manual link is available." : res.email_error || "Copy the link and share it manually.",
        variant: res.email_sent ? "success" : "warning",
      });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Invite failed";
      if (String(msg).toLowerCase().includes("email")) setFormError(String(msg));
      toast("Invite failed", { description: String(msg), variant: "error" });
    },
  });

  const dismissInterestMut = useMutation({
    mutationFn: (id: string) => dismissCompanyInterest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-company-interest"] });
      toast("Company request dismissed", { variant: "success" });
    },
    onError: () => toast("Could not dismiss request", { variant: "error" }),
  });

  function openInvite(request?: CompanyInterestRequest) {
    setInterestRequestId(request?.id);
    setForm({ company_name: "", email: request?.email ?? "", contact_name: "", contact_role: "" });
    setFormError(undefined);
    setModalOpen(true);
  }

  function closeInvite() {
    setModalOpen(false);
    setInterestRequestId(undefined);
    setForm({ company_name: "", email: "", contact_name: "", contact_role: "" });
    setFormError(undefined);
  }

  const resendMut = useMutation({
    mutationFn: (id: string) => resendCompanyInvitation(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-company-invites"] });
      if (res.invitation_url) {
        setIssuedUrls((m) => ({ ...m, [res.invitation_id]: res.invitation_url }));
        void navigator.clipboard?.writeText(res.invitation_url).catch(() => undefined);
      }
      const queued = ["pending", "processing", "retry"].includes(res.delivery_status);
      toast(res.email_sent ? "Invitation sent successfully." : queued ? "Invitation queued" : "Invitation created, email failed", {
        description: res.email_sent ? "The old link was invalidated." : queued ? "The old link was invalidated and delivery will retry automatically." : res.email_error || "Copy the new link and share it securely.",
        variant: res.email_sent ? "success" : "warning",
      });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Resend failed";
      toast("Resend failed", { description: String(msg), variant: "error" });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeCompanyInvitation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-company-invites"] });
      setRevokeTarget(null);
      toast("Invitation revoked", { variant: "success" });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Revoke failed";
      toast("Revoke failed", { description: String(msg), variant: "error" });
    },
  });

  async function copyLink(id: string) {
    const url = issuedUrls[id];
    if (!url) {
      toast("Link available after create or resend", { description: "Raw links are never stored. Resend to issue a fresh link.", variant: "info" });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Invitation link copied.", { variant: "success" });
    } catch {
      toast("Copy failed", { description: url, variant: "error" });
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader
          title="Company Invitations"
          subtitle="Invite organizations to create their CODITENT company workspace."
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{invites.length} total</span>}
          actions={
            <Button size="sm" onClick={() => openInvite()}>
              <FiPlus aria-hidden className="h-3.5 w-3.5" /> Invite company
            </Button>
          }
        />

        <section className="rounded-xl border border-border-subtle bg-surface p-4" aria-labelledby="company-interest-title">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-secondary text-primary"><FiInbox aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <h2 id="company-interest-title" className="text-sm font-semibold text-foreground">Company access requests</h2>
              <p className="text-xs text-muted-foreground">Emails submitted from the public landing page.</p>
            </div>
            <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-foreground-secondary">{pendingInterest.length} pending</span>
          </div>

          {interestQ.isLoading ? (
            <div className="mt-4 h-14 animate-pulse rounded-lg bg-surface-secondary" aria-label="Loading company requests" />
          ) : interestQ.isError ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-background px-3 py-2" role="alert">
              <p className="text-xs font-medium text-danger">Could not load company requests.</p>
              <Button size="sm" variant="outline" onClick={() => interestQ.refetch()}>Retry</Button>
            </div>
          ) : pendingInterest.length === 0 ? (
            <p className="mt-4 rounded-lg bg-surface-secondary px-3 py-3 text-xs text-muted-foreground">No company requests are waiting for review.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle" aria-label="Pending company access requests">
              {pendingInterest.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{request.email}</p>
                    <p className="text-[11px] text-muted-foreground">Requested {dateLabel(request.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openInvite(request)}>Review and invite</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={dismissInterestMut.isPending && dismissInterestMut.variables === request.id}
                      onClick={() => dismissInterestMut.mutate(request.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or email"
            aria-label="Search invitations"
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>

        {invitesQ.isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : invitesQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load invitations.</p>
            <Button size="sm" variant="outline" onClick={() => invitesQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiMail}
            title={invites.length === 0 ? "No company invitations yet" : "No invitations match filters"}
            description="Invite first organization to create its workspace."
            primaryAction={invites.length === 0 ? { label: "Invite company", onClick: () => openInvite() } : undefined}
          />
        ) : (
          <ul className="space-y-2" aria-label="Company invitations">
            {filtered.map((inv) => (
              <li key={inv.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{inv.company_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {inv.email}
                      {inv.contact_name ? ` · ${inv.contact_name}` : ""}
                      {inv.invited_by_email ? ` · by ${inv.invited_by_email}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Sent {dateLabel(inv.created_at)} · Expires {dateLabel(inv.expires_at)}
                      {inv.company_id ? ` · Company created` : ""}
                    </p>
                  </div>
                  <StatusBadge status={inv.status} size="sm" />
                  {inv.email_delivery_status && <StatusBadge status={`email ${inv.email_delivery_status}`} size="sm" showDot={false} />}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {inv.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" loading={resendMut.isPending} onClick={() => resendMut.mutate(inv.id)}>
                        Resend email
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(inv)}>
                        Revoke
                      </Button>
                    </>
                  )}
                  {inv.status === "expired" && (
                    <Button size="sm" variant="outline" loading={resendMut.isPending} onClick={() => resendMut.mutate(inv.id)}>
                      Create new invitation
                    </Button>
                  )}
                  {inv.status === "accepted" && inv.company_id && (
                    <a href="/admin/companies" className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-foreground hover:bg-surface-secondary">
                      View company
                    </a>
                  )}
                  {issuedUrls[inv.id] && inv.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => copyLink(inv.id)}>
                      Copy link
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Modal
          isOpen={modalOpen}
          onClose={closeInvite}
          title="Invite company"
          subtitle="Organization receives a secure single-use link."
          footer={
            <>
              <Button variant="ghost" onClick={closeInvite}>Cancel</Button>
              <Button
                loading={inviteMut.isPending}
                onClick={() => {
                  if (!form.company_name.trim() || !form.email.trim()) {
                    setFormError("Company name and email are required.");
                    return;
                  }
                  inviteMut.mutate();
                }}
              >
                Send invitation
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Input label="Company name" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme Inc" />
            <Input label="Company email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@acme.com" error={formError} autoComplete="email" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Contact name" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Jane Doe" autoComplete="name" />
              <Input label="Contact role" value={form.contact_role} onChange={(e) => setForm({ ...form, contact_role: e.target.value })} placeholder="CEO" />
            </div>
            <p className="text-xs text-muted-foreground">Link expires in 7 days, single-use. Duplicate active invites per email are blocked.</p>
          </div>
        </Modal>

        <ConfirmDialog
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}
          title="Revoke invitation"
          message={`Cancel invitation for ${revokeTarget?.company_name} (${revokeTarget?.email})? Link becomes invalid immediately.`}
          confirmLabel="Revoke invitation"
          isLoading={revokeMut.isPending}
          isDestructive={true}
        />
      </div>
    </AdminShell>
  );
}
