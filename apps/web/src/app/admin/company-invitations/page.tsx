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
import { inviteCompany, listCompanyInvitations, resendCompanyInvitation, revokeCompanyInvitation } from "@/lib/api";
import type { CompanyInvitation } from "@/lib/types";
import { FiMail, FiPlus } from "react-icons/fi";

function dateLabel(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function AdminCompanyInvitationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const invitesQ = useQuery({ queryKey: ["admin-company-invites"], queryFn: listCompanyInvitations });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CompanyInvitation | null>(null);
  const [form, setForm] = useState({ company_name: "", email: "", contact_name: "", contact_role: "" });
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({});

  const invites = invitesQ.data?.invitations ?? [];
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
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-company-invites"] });
      if (res.invitation_url) setIssuedUrls((m) => ({ ...m, [res.invitation_id]: res.invitation_url }));
      setModalOpen(false);
      setForm({ company_name: "", email: "", contact_name: "", contact_role: "" });
      setFormError(undefined);
      toast(res.email_sent ? "Invitation sent" : "Invitation created, email failed", {
        description: res.email_sent ? undefined : res.email_error || "Copy the link and share it manually.",
        variant: res.email_sent ? "success" : "warning",
      });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Invite failed";
      if (String(msg).toLowerCase().includes("email")) setFormError(String(msg));
      toast("Invite failed", { description: String(msg), variant: "error" });
    },
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => resendCompanyInvitation(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-company-invites"] });
      if (res.invitation_url) {
        setIssuedUrls((m) => ({ ...m, [res.invitation_id]: res.invitation_url }));
        void navigator.clipboard?.writeText(res.invitation_url).catch(() => undefined);
      }
      toast("Invitation sent successfully.", { variant: "success" });
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
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <FiPlus aria-hidden className="h-3.5 w-3.5" /> Invite company
            </Button>
          }
        />

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
            primaryAction={invites.length === 0 ? { label: "Invite company", onClick: () => setModalOpen(true) } : undefined}
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
          onClose={() => setModalOpen(false)}
          title="Invite company"
          subtitle="Organization receives a secure single-use link."
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
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
