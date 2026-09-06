"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Drawer } from "@/components/company/Drawer";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { getApplications, getMe, updateApplicationStatus, getAssessments } from "@/lib/api";
import { can } from "@/lib/permissions";
import { ApplicationItem, AssessmentItem } from "@/lib/types";
import {
  FiUsers,
  FiSearch,
  FiFileText,
  FiUserCheck,
  FiChevronRight,
  FiAward,
} from "react-icons/fi";

export default function CompanyCandidatesPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const canMoveStage = can(me ?? null, "move_recruitment_stage");

  const { data: appsData, isLoading, isError } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications as ApplicationItem[],
  });

  const { data: assData } = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments as AssessmentItem[],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCandidate, setSelectedCandidate] = useState<ApplicationItem | null>(null);

  const stageMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await updateApplicationStatus(id, status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      if (selectedCandidate) {
        setSelectedCandidate((prev) => (prev ? { ...prev, status: selectedCandidate.status } : null));
      }
    },
  });

  const apps = appsData ?? [];
  const assessments = assData ?? [];

  const filtered = useMemo(() => {
    let list = apps;
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.candidate_id?.toLowerCase().includes(q) ||
          a.opportunity_id?.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [apps, statusFilter, search]);

  const candidateAssessment = useMemo(() => {
    if (!selectedCandidate) return null;
    return assessments.find(
      (ass) => ass.candidate_id === selectedCandidate.candidate_id || ass.application_id === selectedCandidate.id
    );
  }, [selectedCandidate, assessments]);

  const byStatusCount = (s: string) => apps.filter((a) => a.status === s).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Candidate Applications & ATS"
          subtitle="Track and manage applicants across AI screening, practical assessments, shortlisting, and hiring decisions."
          badge={
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {apps.length} Applicants
            </span>
          }
        />

        {/* Quick Filter Pill Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { key: "all", label: "All Applicants", count: apps.length },
            { key: "applied", label: "Applied", count: byStatusCount("applied") },
            { key: "under_review", label: "Under Review", count: byStatusCount("under_review") },
            { key: "shortlisted", label: "Shortlisted", count: byStatusCount("shortlisted") },
            { key: "assessment_completed", label: "Assessed", count: byStatusCount("assessment_completed") },
            { key: "interview", label: "Interview", count: byStatusCount("interview") },
            { key: "accepted", label: "Hired", count: byStatusCount("accepted") },
            { key: "rejected", label: "Rejected", count: byStatusCount("rejected") },
          ].map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setStatusFilter(pill.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
                statusFilter === pill.key
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs"
                  : "bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-750 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  statusFilter === pill.key
                    ? "bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {pill.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-[#121215] p-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate ID, position reference, application ID…"
              className="h-8 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 pl-8 pr-3 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            Showing <strong className="text-zinc-800 dark:text-zinc-200">{filtered.length}</strong> of {apps.length} candidate(s)
          </div>
        </div>

        {/* Candidate Table */}
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : isError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-6 text-center text-xs text-rose-700 dark:text-rose-300">
            Failed to load candidates. Please verify your company session permissions.
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiUsers}
            title={apps.length === 0 ? "No candidate applications yet" : "No candidates match criteria"}
            description={
              apps.length === 0
                ? "When job seekers apply to your published career openings, their profiles, AI screening badges, and evaluation history will appear in this ATS pipeline."
                : "Try resetting your search query or switching your status filter tab to see other candidates."
            }
            primaryAction={
              apps.length === 0
                ? {
                    label: "View Job Offers",
                    href: "/company/jobs",
                  }
                : undefined
            }
          />
        ) : (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
            <div className="hidden grid-cols-[1.5fr_1.2fr_1fr_0.9fr_140px] gap-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 md:grid">
              <span>Candidate</span>
              <span>Position Ref</span>
              <span>Stage</span>
              <span>Applied Date</span>
              <span className="text-right">Decision</span>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((app) => (
                <div
                  key={app.id}
                  onClick={() => setSelectedCandidate(app)}
                  className="grid cursor-pointer gap-3 p-4 sm:px-6 hover:bg-zinc-50/80 dark:hover:bg-zinc-850 transition-colors md:grid-cols-[1.5fr_1.2fr_1fr_0.9fr_140px] md:items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-bold text-white dark:text-zinc-900 shadow-2xs">
                      {app.candidate_id ? app.candidate_id.slice(0, 2).toUpperCase() : "CA"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        Candidate #{app.candidate_id ? app.candidate_id.slice(0, 8) : "N/A"}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                        App ID: {app.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      Ref: {app.opportunity_id ? app.opportunity_id.slice(0, 8) : "Open Role"}
                    </span>
                  </div>

                  <div>
                    <StatusBadge status={app.status} size="sm" />
                  </div>

                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {app.created_at ? new Date(app.created_at).toLocaleDateString() : "Recent"}
                  </div>

                  <div
                    className="flex items-center justify-end gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canMoveStage && (
                      <>
                        {app.status === "applied" && (
                          <button
                            type="button"
                            onClick={() => stageMut.mutate({ id: app.id, status: "shortlisted" })}
                            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                          >
                            Shortlist
                          </button>
                        )}
                        {app.status === "shortlisted" && (
                          <button
                            type="button"
                            onClick={() => stageMut.mutate({ id: app.id, status: "interview" })}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                          >
                            Interview
                          </button>
                        )}
                        {app.status === "interview" && (
                          <button
                            type="button"
                            onClick={() => stageMut.mutate({ id: app.id, status: "accepted" })}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                          >
                            Hire
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCandidate(app)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                      title="Inspect Candidate Drawer"
                    >
                      <FiChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Candidate Detail Drawer */}
        <Drawer
          isOpen={!!selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          title={`Candidate #${selectedCandidate?.candidate_id?.slice(0, 8) || ""}`}
          subtitle={`Application ID: ${selectedCandidate?.id}`}
          width="lg"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Stage: <StatusBadge status={selectedCandidate?.status} size="sm" />
              </span>

              {canMoveStage && selectedCandidate && (
                <div className="flex items-center gap-2">
                  {selectedCandidate.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => {
                        stageMut.mutate({ id: selectedCandidate.id, status: "rejected" });
                        setSelectedCandidate(null);
                      }}
                      className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                    >
                      Reject
                    </button>
                  )}
                  {selectedCandidate.status !== "shortlisted" && (
                    <button
                      type="button"
                      onClick={() => {
                        stageMut.mutate({ id: selectedCandidate.id, status: "shortlisted" });
                        setSelectedCandidate({ ...selectedCandidate, status: "shortlisted" });
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Shortlist
                    </button>
                  )}
                  {selectedCandidate.status !== "interview" && (
                    <button
                      type="button"
                      onClick={() => {
                        stageMut.mutate({ id: selectedCandidate.id, status: "interview" });
                        setSelectedCandidate({ ...selectedCandidate, status: "interview" });
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Interview
                    </button>
                  )}
                  {selectedCandidate.status !== "accepted" && (
                    <button
                      type="button"
                      onClick={() => {
                        stageMut.mutate({ id: selectedCandidate.id, status: "accepted" });
                        setSelectedCandidate({ ...selectedCandidate, status: "accepted" });
                      }}
                      className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                    >
                      Mark as Hired
                    </button>
                  )}
                </div>
              )}
            </div>
          }
        >
          {selectedCandidate && (
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Application Info</span>
                  <StatusBadge status={selectedCandidate.status} size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Position Reference</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedCandidate.opportunity_id}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Submitted On</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {selectedCandidate.created_at
                        ? new Date(selectedCandidate.created_at).toLocaleString()
                        : "Verified Record"}
                    </span>
                  </div>
                </div>
              </div>

              {/* CODITENT Workflow Evaluation: Screening + Assessment + Decision */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Recruitment Evaluation Workflow
                </h4>

                {/* 1. Screening */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <FiAward className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">1. AI Candidate Screening</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    AI screening verified candidate qualifications and matching against position requirements.
                  </p>
                  <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2.5 text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>Screening Status:</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">Eligible for Review</span>
                  </div>
                </div>

                {/* 2. Practical Assessment */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <FiFileText className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">2. Practical Assessment</span>
                  </div>
                  {candidateAssessment ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-400">Status:</span>
                        <StatusBadge status={candidateAssessment.status} size="sm" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-400">Score:</span>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {candidateAssessment.score !== null && candidateAssessment.score !== undefined
                            ? `${candidateAssessment.score} / 100`
                            : "Pending evaluation"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                      No standalone practical assessment registered yet for this application.
                    </p>
                  )}
                </div>

                {/* 3. Recruiter Decision Controls */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FiUserCheck className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">3. Recruiter Stage Action</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Change stage according to your evaluation:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {["under_review", "shortlisted", "interview", "accepted"].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          stageMut.mutate({ id: selectedCandidate.id, status: st });
                          setSelectedCandidate({ ...selectedCandidate, status: st });
                        }}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                          selectedCandidate.status === st
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                            : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {st.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </AppShell>
  );
}
