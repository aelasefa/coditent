"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatCard } from "@/components/company/StatCard";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Drawer } from "@/components/company/Drawer";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { getAssessments, getMe } from "@/lib/api";
import { AssessmentItem } from "@/lib/types";
import {
  FiFileText,
  FiSearch,
  FiCheckCircle,
  FiAward,
  FiUser,
  FiChevronRight,
} from "react-icons/fi";

export default function AssessmentsPage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const { data: assData, isLoading, isError } = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments as AssessmentItem[],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentItem | null>(null);

  const assessments = assData ?? [];

  const filtered = useMemo(() => {
    let list = assessments;
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.candidate_id?.toLowerCase().includes(q) ||
          a.title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assessments, statusFilter, search]);

  const completedCount = assessments.filter((a) => a.status === "completed" || a.status === "evaluated").length;
  const pendingCount = assessments.filter((a) => a.status === "pending" || a.status === "in_progress").length;
  const scoredItems = assessments.filter((a) => typeof a.score === "number");
  const avgScore =
    scoredItems.length > 0
      ? Math.round(scoredItems.reduce((acc, a) => acc + (a.score || 0), 0) / scoredItems.length)
      : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Practical Skill Assessments"
          subtitle="Assess candidate technical competence with automated tests and practical evaluation benchmarks."
          badge={
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {assessments.length} Total
            </span>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Assessments"
            value={assessments.length}
            subValue="Company-scoped evaluation tests"
            icon={FiFileText}
          />
          <StatCard
            label="Completed & Evaluated"
            value={completedCount}
            subValue={`${pendingCount} awaiting candidate completion`}
            icon={FiCheckCircle}
          />
          <StatCard
            label="Average Candidate Score"
            value={scoredItems.length > 0 ? `${avgScore} / 100` : "—"}
            subValue={scoredItems.length > 0 ? `Across ${scoredItems.length} scored tests` : "No scores recorded yet"}
            icon={FiAward}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-[#121215] p-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assessment ID, title, candidate ID…"
              className="h-8 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 pl-8 pr-3 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 text-xs text-zinc-700 dark:text-zinc-200 focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="evaluated">Evaluated</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : isError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-6 text-center text-xs text-rose-700 dark:text-rose-300">
            Failed to load practical assessments.
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiFileText}
            title={assessments.length === 0 ? "No practical assessments yet" : "No assessments match filters"}
            description={
              assessments.length === 0
                ? "When candidates take practical technical tests for your career opportunities, their test submissions, automated benchmarks, and scores will be logged here."
                : "Try clearing your search query or adjusting your status filter."
            }
          />
        ) : (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
            <div className="hidden grid-cols-[1.5fr_1.2fr_1fr_1fr_60px] gap-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 md:grid">
              <span>Assessment Test</span>
              <span>Candidate Ref</span>
              <span>Status</span>
              <span>Score Benchmark</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((ass) => (
                <div
                  key={ass.id}
                  onClick={() => setSelectedAssessment(ass)}
                  className="grid cursor-pointer gap-3 p-4 sm:px-6 hover:bg-zinc-50/80 dark:hover:bg-zinc-850 transition-colors md:grid-cols-[1.5fr_1.2fr_1fr_1fr_60px] md:items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                      <FiFileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {ass.title || `Assessment #${ass.id.slice(0, 8)}`}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                        ID: {ass.id}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FiUser className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="font-medium">
                      Candidate: {ass.candidate_id ? ass.candidate_id.slice(0, 8) : "Applicant"}
                    </span>
                  </div>

                  <div>
                    <StatusBadge status={ass.status} size="sm" />
                  </div>

                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {ass.score !== null && ass.score !== undefined ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/60">
                        {ass.score} / 100
                      </span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500 font-normal">Pending Evaluation</span>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <FiChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assessment Detail Drawer */}
        <Drawer
          isOpen={!!selectedAssessment}
          onClose={() => setSelectedAssessment(null)}
          title={selectedAssessment?.title || `Assessment #${selectedAssessment?.id?.slice(0, 8)}`}
          subtitle={`Assessment ID: ${selectedAssessment?.id}`}
          width="md"
        >
          {selectedAssessment && (
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Test Details</span>
                  <StatusBadge status={selectedAssessment.status} size="sm" />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400">Candidate ID:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedAssessment.candidate_id || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400">Application ID:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedAssessment.application_id || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-400">Evaluation Score:</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {selectedAssessment.score !== null && selectedAssessment.score !== undefined
                        ? `${selectedAssessment.score} / 100`
                        : "Awaiting candidate completion"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-500 dark:text-zinc-400">Status:</span>
                    <span className="capitalize font-medium text-zinc-800 dark:text-zinc-200">{selectedAssessment.status}</span>
                  </div>
                </div>
              </div>

              {selectedAssessment.description && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                    Test Description
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 leading-relaxed">
                    {selectedAssessment.description}
                  </p>
                </div>
              )}

              {selectedAssessment.report && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                    Evaluation Report
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 leading-relaxed">
                    {selectedAssessment.report}
                  </p>
                </div>
              )}
            </div>
          )}
        </Drawer>
      </div>
    </AppShell>
  );
}
