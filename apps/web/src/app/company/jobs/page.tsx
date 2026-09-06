"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Modal } from "@/components/company/Modal";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { createOffer, getMe, toggleOffer, api, getApiBaseUrl } from "@/lib/api";
import { can } from "@/lib/permissions";
import { Offer } from "@/lib/types";
import {
  FiBriefcase,
  FiPlus,
  FiSearch,
  FiEdit3,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiMapPin,
  FiTag,
  FiCalendar,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";

function getErrorMessage(err: unknown): string {
  const d = (err as any)?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((e: any) => e.msg || e.message || JSON.stringify(e)).join("; ");
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return (d as any).msg || JSON.stringify(d);
  const m = (err as any)?.message;
  if (typeof m === "string" && m) return m;
  return "Request failed";
}

export default function CompanyJobsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const canCreate = can(me ?? null, "create_offers");
  const canEdit = can(me ?? null, "edit_offers");
  const canDelete = can(me ?? null, "delete_offers");

  const { data: offers, isLoading, isError } = useQuery({
    queryKey: ["company-offers"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("coditent_token") : null;
      const r = await fetch(`${getApiBaseUrl()}/offers/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      }).then((x) => x.json()).catch(() => ({ offers: [] }));
      return (r.offers as Offer[]) || [];
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "JOB" | "INTERNSHIP">("all");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Offer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Offer | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const [form, setForm] = useState({
    title: "",
    company: "",
    region: "Remote",
    field: "Software Engineering",
    type: "JOB" as "JOB" | "INTERNSHIP",
    description: "",
    requirements: "",
  });

  const [editForm, setEditForm] = useState({
    title: "",
    company: "",
    region: "",
    field: "",
    type: "JOB" as "JOB" | "INTERNSHIP",
    description: "",
    requirements: "",
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!form.title.trim() || form.title.trim().length < 2) {
        throw new Error("Job title must be at least 2 characters");
      }
      if (!form.company.trim() || form.company.trim().length < 2) {
        throw new Error("Company name must be at least 2 characters");
      }
      if (!form.region.trim() || !form.field.trim()) {
        throw new Error("Region and field are required");
      }
      if (!form.description.trim() || form.description.trim().length < 10) {
        throw new Error("Description must be at least 10 characters");
      }
      if (!form.requirements.trim() || form.requirements.trim().length < 10) {
        throw new Error("Requirements must be at least 10 characters");
      }
      return createOffer(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setCreateModalOpen(false);
      setForm({
        title: "",
        company: "",
        region: "Remote",
        field: "Software Engineering",
        type: "JOB",
        description: "",
        requirements: "",
      });
      setStatusMessage({ text: "Job offer published successfully!" });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({ text: getErrorMessage(e), isError: true });
    },
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      await api.put(`/offers/${editTarget.id}`, editForm);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setEditTarget(null);
      setStatusMessage({ text: "Job updated successfully!" });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({ text: getErrorMessage(e), isError: true });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (offerId: string) => toggleOffer(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
    },
    onError: (e: any) => {
      setStatusMessage({ text: getErrorMessage(e), isError: true });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/offers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-offers"] });
      setDeleteTarget(null);
      setStatusMessage({ text: "Job offer removed." });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({ text: getErrorMessage(e), isError: true });
    },
  });

  const openEdit = (o: Offer) => {
    setEditTarget(o);
    setEditForm({
      title: o.title,
      company: o.company,
      region: o.region,
      field: o.field,
      type: o.type,
      description: o.description,
      requirements: o.requirements,
    });
  };

  const filteredOffers = useMemo(() => {
    let list = offers ?? [];
    if (statusFilter === "active") list = list.filter((o) => o.active);
    if (statusFilter === "paused") list = list.filter((o) => !o.active);
    if (typeFilter !== "all") list = list.filter((o) => o.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.company.toLowerCase().includes(q) ||
          o.region.toLowerCase().includes(q) ||
          o.field.toLowerCase().includes(q)
      );
    }
    return list;
  }, [offers, search, statusFilter, typeFilter]);

  const activeCount = (offers ?? []).filter((o) => o.active).length;
  const pausedCount = (offers ?? []).length - activeCount;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Job Offers & Positions"
          subtitle="Publish and manage your company's career openings, requirements, and hiring status."
          badge={
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {(offers ?? []).length} Total
            </span>
          }
          actions={
            canCreate ? (
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                <FiPlus className="h-4 w-4" />
                <span>Create job offer</span>
              </button>
            ) : null
          }
        />

        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium border ${
              statusMessage.isError
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            {statusMessage.isError ? (
              <FiAlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <FiCheckCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-[#121215] p-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, department, region…"
              className="h-8 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 pl-8 pr-3 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 text-xs text-zinc-700 dark:text-zinc-200 focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">All Statuses ({offers?.length ?? 0})</option>
              <option value="active">Active ({activeCount})</option>
              <option value="paused">Paused ({pausedCount})</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 text-xs text-zinc-700 dark:text-zinc-200 focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="JOB">Full-time Job</option>
              <option value="INTERNSHIP">Internship</option>
            </select>
          </div>
        </div>

        {/* Jobs List */}
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : isError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-6 text-center text-xs text-rose-700 dark:text-rose-300">
            Failed to load jobs. Please refresh or verify your connection.
          </div>
        ) : filteredOffers.length === 0 ? (
          <EmptyState
            icon={FiBriefcase}
            title={offers?.length === 0 ? "No job offers published" : "No matching jobs found"}
            description={
              offers?.length === 0
                ? "Create your company's first job offer to attract qualified candidates, trigger AI screening, and schedule assessments."
                : "Try clearing your search query or adjusting your status filters to see available jobs."
            }
            primaryAction={
              canCreate && offers?.length === 0
                ? {
                    label: "+ Create Job Offer",
                    onClick: () => setCreateModalOpen(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-50/70 dark:hover:bg-zinc-850 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                        {offer.title}
                      </h3>
                      <StatusBadge status={offer.active ? "active" : "paused"} size="sm" />
                      <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {offer.type}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                        {offer.company}
                      </span>
                      <span className="flex items-center gap-1">
                        <FiMapPin className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{offer.region}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <FiTag className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{offer.field}</span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        <FiCalendar className="h-3 w-3" />
                        <span>Posted {new Date(offer.posted_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleMut.mutate(offer.id)}
                      title={offer.active ? "Pause job" : "Activate job"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {offer.active ? (
                        <>
                          <FiToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <FiToggleLeft className="h-4 w-4 text-zinc-400" />
                          <span>Paused</span>
                        </>
                      )}
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(offer)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        title="Edit details"
                      >
                        <FiEdit3 className="h-4 w-4" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(offer)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete job"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Job Offer Modal */}
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create Job Offer"
          subtitle="Publish a new career opportunity for candidate screening and practical assessment."
          maxWidth="xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
              >
                {createMut.isPending ? "Publishing…" : "Publish Offer"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Job Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Senior Frontend Engineer"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="e.g. Acme Labs"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Employment Type *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                >
                  <option value="JOB">Full-time Job</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Region / Location *
                </label>
                <input
                  type="text"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  placeholder="e.g. Remote / Paris / Casablanca"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Field / Department *
                </label>
                <input
                  type="text"
                  value={form.field}
                  onChange={(e) => setForm({ ...form, field: e.target.value })}
                  placeholder="e.g. Engineering / Data / Product"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Description *
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Overview of the role, team, and day-to-day responsibilities (min 10 characters)..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Requirements & Qualifications *
              </label>
              <textarea
                rows={3}
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                placeholder="Core skills, experience level, tools, and qualifications required (min 10 characters)..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        </Modal>

        {/* Edit Job Modal */}
        <Modal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          title="Edit Job Offer"
          subtitle="Update position details and requirements."
          maxWidth="xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => editMut.mutate()}
                disabled={editMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
              >
                {editMut.isPending ? "Saving…" : "Save Changes"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Job Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Type
                </label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                >
                  <option value="JOB">JOB</option>
                  <option value="INTERNSHIP">INTERNSHIP</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Region
                </label>
                <input
                  type="text"
                  value={editForm.region}
                  onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Field
                </label>
                <input
                  type="text"
                  value={editForm.field}
                  onChange={(e) => setEditForm({ ...editForm, field: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Requirements
              </label>
              <textarea
                rows={3}
                value={editForm.requirements}
                onChange={(e) => setEditForm({ ...editForm, requirements: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
          title="Delete Job Offer"
          message={`Are you sure you want to permanently remove "${deleteTarget?.title}"? Any pending applications will also be archived.`}
          confirmLabel="Delete Job"
          isLoading={deleteMut.isPending}
          isDestructive={true}
        />
      </div>
    </AppShell>
  );
}
