"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Drawer } from "@/components/company/Drawer";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getApplications, getMe, updateApplicationStatus, getAssessments, getApiBaseUrl, listRecruitmentChats } from "@/lib/api";
import { can } from "@/lib/permissions";
import type { ApplicationItem, AssessmentItem, Offer } from "@/lib/types";
import { HIRING_STAGES, candidateName, hiringStage, jobTitleFor } from "@/components/company/hiring";
import { AiScore, CandidateCard } from "@/components/company/CandidateCard";
import { CandidateDetail } from "@/components/company/CandidateDetail";
import { FiSearch, FiUsers } from "react-icons/fi";

type View = "list" | "board";

function PipelineContent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canMoveStage = can(me ?? null, "move_recruitment_stage");

  const appsQ = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await getApplications()).applications as ApplicationItem[],
  });
  const assQ = useQuery({
    queryKey: ["assessments"],
    queryFn: async () => (await getAssessments()).assessments as AssessmentItem[],
  });
  const offersQ = useQuery({
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
    enabled: !!me,
  });
  const chatsQ = useQuery({ queryKey: ["company-recruitment-chats"], queryFn: listRecruitmentChats, retry: false });
  const chatByApp = useMemo(() => new Map((chatsQ.data ?? []).map((c) => [c.application_id, c])), [chatsQ.data]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [jobFilter, setJobFilter] = useState(searchParams.get("job") ?? "all");
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("app"));

  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
    const j = searchParams.get("job");
    if (j) setJobFilter(j);
    const a = searchParams.get("app");
    if (a) setSelectedId(a);
  }, [searchParams]);

  const stageMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateApplicationStatus(id, status),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      const chatNow = vars.status !== "applied" && vars.status !== "rejected";
      toast(chatNow ? "Candidate advanced. Messaging now available." : "Stage updated.", { variant: "success" });
      qc.invalidateQueries({ queryKey: ["company-recruitment-chats"] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Stage update failed";
      toast("Stage update failed", { description: String(msg), variant: "error" });
    },
  });

  const apps = appsQ.data ?? [];
  const assessments = assQ.data ?? [];
  const offersById = useMemo(() => new Map((offersQ.data ?? []).map((o) => [o.id, o.title])), [offersQ.data]);

  const filtered = useMemo(() => {
    let list = apps;
    if (statusFilter !== "all") {
      if (statusFilter === "assessment") list = list.filter((a) => a.status === "assessment_required" || a.status === "assessment_completed");
      else list = list.filter((a) => a.status === statusFilter);
    }
    if (jobFilter !== "all") list = list.filter((a) => a.opportunity_id === jobFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const name = candidateName(a).toLowerCase();
        const email = (a.candidate?.email ?? "").toLowerCase();
        const job = jobTitleFor(a, offersById).toLowerCase();
        const skills = String((a.candidate as { skills?: string } | undefined)?.skills ?? "").toLowerCase();
        return name.includes(q) || email.includes(q) || job.includes(q) || skills.includes(q);
      });
    }
    return list;
  }, [apps, statusFilter, jobFilter, search, offersById]);

  const selected = apps.find((a) => a.id === selectedId) ?? null;
  const selectedAssessment = selected
    ? assessments.find((x) => x.candidate_id === selected.candidate_id || x.application_id === selected.id) ?? null
    : null;
  const selectedChat = selected ? chatByApp.get(selected.id) : null;
  const selectedUnlocked = Boolean(selected && (selected.chat_enabled || selectedChat));

  const boardGroups = useMemo(
    () =>
      HIRING_STAGES.map((s) => ({
        stage: s,
        items: filtered.filter((a) => hiringStage(a.status) === s || (s === "Assessment" && hiringStage(a.status) === "Assessment")),
      })),
    [filtered]
  );

  const isLoading = appsQ.isLoading;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Candidates"
          subtitle={`${apps.length} applicants across hiring stages. Select a card for detail and stage actions.`}
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{filtered.length} shown</span>}
          actions={
            <div role="group" aria-label="View mode" className="flex rounded-lg border border-border p-0.5">
              {(["list", "board"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={view === v ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"}
                >
                  {v === "list" ? "List" : "Board"}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="pipeline-search" className="sr-only">Search candidates</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="pipeline-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, skills, job title"
              className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Stage filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
              <option value="all">All stages</option>
              <option value="applied">Applied</option>
              <option value="under_review">Screening</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="assessment">Assessment</option>
              <option value="interview">Interview</option>
              <option value="accepted">Hired</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} aria-label="Job filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
              <option value="all">All jobs</option>
              {(offersQ.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : appsQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load candidates.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Verify company session, then retry.</p>
            <Button size="sm" variant="outline" onClick={() => appsQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiUsers}
            title={apps.length === 0 ? "No applications yet" : "No candidates match filters"}
            description={apps.length === 0 ? "Candidates appear here when they apply to published roles." : "Adjust search, stage or job filters."}
            primaryAction={apps.length === 0 ? { label: "View jobs", href: "/company/jobs" } : { label: "Clear filters", onClick: () => { setSearch(""); setStatusFilter("all"); setJobFilter("all"); } }}
          />
        ) : view === "list" ? (
          <ul className="space-y-2" aria-label="Candidates">
            {filtered.map((app) => (
              <li key={app.id}>
                <CandidateCard app={app} jobTitle={jobTitleFor(app, offersById)} selected={selectedId === app.id} onOpen={() => setSelectedId(app.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Pipeline board, read-only">
            {boardGroups.map((g) => (
              <section key={g.stage} aria-label={`${g.stage} column`} className="rounded-xl border border-border-subtle bg-surface-secondary/40 p-2.5">
                <h3 className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {g.stage}
                  <span className="rounded-full bg-surface px-1.5 text-[11px]">{g.items.length}</span>
                </h3>
                <div className="mt-2 space-y-2">
                  {g.items.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedId(app.id)}
                      aria-label={`Open ${candidateName(app)} in ${g.stage}`}
                      className="block w-full rounded-lg border border-border-subtle bg-surface p-2.5 text-left hover:border-border-strong"
                    >
                      <span className="block truncate text-[13px] font-semibold text-foreground">{candidateName(app)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{jobTitleFor(app, offersById)}</span>
                      <span className="mt-1.5 block"><AiScore app={app} /></span>
                    </button>
                  ))}
                  {g.items.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground">Empty</p>}
                </div>
              </section>
            ))}
          </div>
        )}

        <Drawer
          isOpen={!!selected}
          onClose={() => setSelectedId(null)}
          title={selected ? candidateName(selected) : "Candidate"}
          subtitle={selected ? `${jobTitleFor(selected, offersById)} · ${selected.status.replace(/_/g, " ")}` : undefined}
          width="lg"
          footer={
            selected ? (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                Stage <StatusBadge status={selected.status} size="sm" />
              </span>
            ) : undefined
          }
        >
          {selected && (
            <CandidateDetail
              app={selected}
              jobTitle={jobTitleFor(selected, offersById)}
              assessment={selectedAssessment}
              canMoveStage={canMoveStage}
              stagePending={stageMut.isPending}
              chatUnlocked={selectedUnlocked}
              onStage={(st) => stageMut.mutate({ id: selected.id, status: st })}
              onReject={() => stageMut.mutate({ id: selected.id, status: "rejected" })}
            />
          )}
        </Drawer>
      </div>
    </AppShell>
  );
}

export default function CompanyCandidatesPage() {
  return (
    <Suspense fallback={<AppShell><p className="p-6 text-sm text-muted-foreground" role="status">Loading candidates</p></AppShell>}>
      <PipelineContent />
    </Suspense>
  );
}

