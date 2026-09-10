"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Modal } from "@/components/company/Modal";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createOffer, getMe, toggleOffer, api, getApiBaseUrl, getCompanyMembers, getApplications, getAssessments, setResponsibleHr } from "@/lib/api";
import { can, hasCompanyRole } from "@/lib/permissions";
import type { Offer } from "@/lib/types";
import { FiBriefcase, FiPlus, FiSearch } from "react-icons/fi";

function getErrorMessage(err: unknown): string {
  const d = (err as { response?: { data?: { detail?: unknown } }; message?: string })?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((e: { msg?: string; message?: string }) => e.msg || e.message || JSON.stringify(e)).join("; ");
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return (d as { msg?: string }).msg || JSON.stringify(d);
  const m = (err as { message?: string })?.message;
  if (typeof m === "string" && m) return m;
  return "Request failed";
}

const EMPTY_FORM = {
  title: "",
  company: "",
  region: "Remote",
  field: "Software Engineering",
  type: "JOB" as "JOB" | "INTERNSHIP",
  description: "",
  requirements: "",
};

export default function CompanyJobsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const canCreate = can(me ?? null, "create_offers");
  const canEdit = can(me ?? null, "edit_offers");
  const canDelete = can(me ?? null, "delete_offers");
  const canAssignHr = hasCompanyRole(me ?? null, ["OWNER", "ADMIN"]);

  const { data: members } = useQuery({
    queryKey: ["company-members", me?.company_id],
    queryFn: () => getCompanyMembers(me!.company_id as string),
    enabled: !!me?.company_id,
  });

  const { data: offers, isLoading, isError } = useQuery({
    queryKey: ["company-offers"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("coditent_token") : null;
      const r = await fetch(`${getApiBaseUrl()}/offers/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      }).then((x) => {
        if (!x.ok) throw new Error(`Jobs request failed: ${x.status}`);
        return x.json();
      });
      return (r.offers as Offer[]) || [];
    },
  });
  const appsQ = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications,
    enabled: !!me,
  });
  const assQ = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments,
    enabled: !!me,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "JOB" | "INTERNSHIP">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Offer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Offer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [responsibleHrId, setResponsibleHrId] = useState("");

  const apps = (appsQ.data ?? []) as unknown as Array<{ opportunity_id: string; status: string }>;
  const assessments = (assQ.data ?? []) as Array<{ id: string }>;
  const appsByOffer = useMemo(() => {
    const m = new Map<string, number>();
    apps.forEach((a) => m.set(a.opportunity_id, (m.get(a.opportunity_id) ?? 0) + 1));
    return m;
  }, [apps]);

  const notify = (text: string, isError?: boolean) =>
    toast(isError ? "Request failed" : "Done", { description: text, variant: isError ? "error" : "success" });

  const hrMut = useMutation({
    mutationFn: ({ offerId, hrId }: { offerId: string; hrId: string }) => setResponsibleHr(offerId, hrId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      notify("Responsible recruiter updated.");
    },
    onError: (e: unknown) => notify(getErrorMessage(e), true),
  });
  const createMut = useMutation({
    mutationFn: () => {
      if (!form.title.trim() || form.title.trim().length < 2) throw new Error("Job title must be at least 2 characters");
      if (!form.company.trim() || form.company.trim().length < 2) throw new Error("Company name must be at least 2 characters");
      if (!form.region.trim() || !form.field.trim()) throw new Error("Region and field are required");
      if (!form.description.trim() || form.description.trim().length < 10) throw new Error("Description must be at least 10 characters");
      if (!form.requirements.trim() || form.requirements.trim().length < 10) throw new Error("Requirements must be at least 10 characters");
      return createOffer(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      notify("Job offer published.");
    },
    onError: (e: unknown) => notify(getErrorMessage(e), true),
  });
  const editMut = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      await api.put(`/offers/${editTarget.id}`, editForm);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setEditTarget(null);
      notify("Job updated.");
    },
    onError: (e: unknown) => notify(getErrorMessage(e), true),
  });
  const toggleMut = useMutation({
    mutationFn: (offerId: string) => toggleOffer(offerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-offers"] }),
    onError: (e: unknown) => notify(getErrorMessage(e), true),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/offers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setDeleteTarget(null);
      notify("Job offer removed.");
    },
    onError: (e: unknown) => notify(getErrorMessage(e), true),
  });

  const openEdit = (o: Offer) => {
    setEditTarget(o);
    setResponsibleHrId(o.responsible_hr_id ?? "");
    setEditForm({ title: o.title, company: o.company, region: o.region, field: o.field, type: o.type, description: o.description, requirements: o.requirements });
  };

  const filtered = useMemo(() => {
    let list = offers ?? [];
    if (statusFilter === "active") list = list.filter((o) => o.active);
    if (statusFilter === "paused") list = list.filter((o) => !o.active);
    if (typeFilter !== "all") list = list.filter((o) => o.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) => o.title.toLowerCase().includes(q) || o.company.toLowerCase().includes(q) || o.region.toLowerCase().includes(q) || o.field.toLowerCase().includes(q)
      );
    }
    return list;
  }, [offers, search, statusFilter, typeFilter]);

  const formFields = (
    value: typeof form,
    set: (v: typeof form) => void,
    prefix: string
  ) => (
    <div className="space-y-4">
      <section aria-label="Basics">
        <h3 className="text-sm font-semibold text-foreground">Basics</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input label="Job title" value={value.title} onChange={(e) => set({ ...value, title: e.target.value })} required />
          <Input label="Company" value={value.company} onChange={(e) => set({ ...value, company: e.target.value })} required />
          <Input label="Region" value={value.region} onChange={(e) => set({ ...value, region: e.target.value })} required />
          <Input label="Field" value={value.field} onChange={(e) => set({ ...value, field: e.target.value })} required />
          <Select label="Type" value={value.type} onChange={(e) => set({ ...value, type: e.target.value as "JOB" | "INTERNSHIP" })}>
            <option value="JOB">Full-time job</option>
            <option value="INTERNSHIP">Internship</option>
          </Select>
        </div>
      </section>
      <section aria-label="Description">
        <h3 className="text-sm font-semibold text-foreground">Description</h3>
        <div className="mt-2">
          <Textarea label="What will the hire do" rows={5} value={value.description} onChange={(e) => set({ ...value, description: e.target.value })} required helper="Minimum 10 characters" />
        </div>
      </section>
      <section aria-label="Requirements">
        <h3 className="text-sm font-semibold text-foreground">Requirements</h3>
        <div className="mt-2">
          <Textarea label="Required skills and experience" rows={4} value={value.requirements} onChange={(e) => set({ ...value, requirements: e.target.value })} required helper="Minimum 10 characters" />
        </div>
      </section>
      <p className="text-xs text-muted-foreground">{prefix} Hiring team assignment lives on each job row for owners and admins.</p>
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Jobs"
          subtitle={`${offers?.length ?? 0} roles · ${activeCount(offers)} active. Publish and manage openings.`}
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{offers?.length ?? 0} total</span>}
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <FiPlus aria-hidden className="h-3.5 w-3.5" /> Create job
              </Button>
            ) : null
          }
        />

        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="jobs-search" className="sr-only">Search jobs</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="jobs-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Search title, company, region, field"
              className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Status filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} aria-label="Type filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
              <option value="all">All types</option>
              <option value="JOB">Job</option>
              <option value="INTERNSHIP">Internship</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load jobs.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Check company session, then retry.</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiBriefcase}
            title={offers?.length === 0 ? "No jobs yet" : "No jobs match filters"}
            description={offers?.length === 0 ? "Publish first role to start receiving candidates." : "Adjust search or filters."}
            primaryAction={canCreate && offers?.length === 0 ? { label: "Create job", onClick: () => setCreateOpen(true) } : undefined}
          />
        ) : (
          <ul className="space-y-2" aria-label="Jobs">
            {filtered.map((o) => (
              <li key={o.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-foreground">{o.title}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      {o.company} · {o.region} · {o.field} · {o.type === "JOB" ? "Job" : "Internship"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {appsByOffer.get(o.id) ?? 0} applicants
                      {assQ.data ? ` · ${assessments.length} assessments in workspace` : ""}
                    </p>
                  </div>
                  <StatusBadge status={o.active ? "active" : "paused"} size="sm" showDot={false} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/company/candidates?job=${o.id}`} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-secondary">
                    View candidates
                  </Link>
                  {canEdit && (
                    <button type="button" onClick={() => openEdit(o)} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-secondary">
                      Edit
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => toggleMut.mutate(o.id)}
                      disabled={toggleMut.isPending}
                      aria-pressed={o.active}
                      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-secondary"
                    >
                      {o.active ? "Pause" : "Activate"}
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => setDeleteTarget(o)} className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-danger hover:bg-danger-background">
                      Delete
                    </button>
                  )}
                  {canAssignHr && members && members.length > 0 && (
                    <select
                      value={o.id === editTarget?.id ? responsibleHrId : o.responsible_hr_id ?? ""}
                      onChange={(e) => hrMut.mutate({ offerId: o.id, hrId: e.target.value })}
                      aria-label={`Responsible recruiter for ${o.title}`}
                      className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
                    >
                      <option value="">Unassigned HR</option>
                      {members.map((m: { id: string; full_name: string; email: string }) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create job" subtitle="Basics, description, requirements" footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>Publish job</Button>
          </>
        }>
          {formFields(form, setForm, "")}
          {createMut.isError && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{getErrorMessage(createMut.error)}</p>}
        </Modal>

        <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit ${editTarget?.title ?? ""}`} footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => editMut.mutate()} loading={editMut.isPending}>Save changes</Button>
          </>
        }>
          {formFields(editForm, setEditForm, "")}
          {editMut.isError && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{getErrorMessage(editMut.error)}</p>}
        </Modal>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete job"
          message={`Delete ${deleteTarget?.title}? Candidates lose this listing. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        />
      </div>
    </AppShell>
  );
}

function activeCount(offers?: Offer[] | null): number {
  return (offers ?? []).filter((o) => o.active).length;
}
