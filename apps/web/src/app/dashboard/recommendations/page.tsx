"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api, generateRecommendations, getProfile, getRecommendationJob, getRecommendations } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/shell/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { FilterBar, type DiscoverFilters } from "@/components/candidate/filter-bar";
import { JobCard, JobCardSkeleton } from "@/components/candidate/job-card";
import { JobDetails, JobDetailsSkeleton } from "@/components/candidate/job-details";
import type { ApplicationItem } from "@/lib/types";
import styles from "@/components/candidate/candidate-pages.module.css";

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<PageContainer variant="wide"><p className="text-sm text-muted-foreground" role="status">Loading Discover</p></PageContainer>}>
      <RecommendationsContent />
    </Suspense>
  );
}

function RecommendationsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const deepOffer = searchParams.get("offer");

  const [filters, setFilters] = useState<DiscoverFilters>({
    query: "",
    field: "",
    region: "",
    type: "ALL",
    sort: "match",
  });
  const [selectedId, setSelectedId] = useState<string | null>(deepOffer);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const recsQuery = useQuery({ queryKey: ["recommendations"], queryFn: getRecommendations });
  const { toast } = useToast();
  const [jobFailed, setJobFailed] = useState(false);
  const [pollingJob, setPollingJob] = useState(false);
  const generateMutation = useMutation({
    mutationFn: generateRecommendations,
    onSuccess: async (job) => {
      // Backend scores asynchronously; follow the job instead of assuming instant results.
      if (job.status === "completed") {
        await queryClient.invalidateQueries({ queryKey: ["recommendations"] });
        toast("Recommendations refreshed", { variant: "success" });
        return;
      }
      setPollingJob(true);
      const deadline = Date.now() + 90000;
      try {
        for (;;) {
          await new Promise((r) => setTimeout(r, 2000));
          const state = await getRecommendationJob(job.job_id);
          if (state.status === "completed") {
            await queryClient.invalidateQueries({ queryKey: ["recommendations"] });
            toast("Recommendations refreshed", { variant: "success" });
            return;
          }
          if (state.status === "failed") {
            setJobFailed(true);
            toast("Match scoring failed", { description: "The scoring job did not complete. Retry to run it again.", variant: "error" });
            return;
          }
          if (Date.now() > deadline) {
            setJobFailed(true);
            toast("Match scoring timed out", { description: "Results are not ready yet. Retry to run scoring again.", variant: "error" });
            return;
          }
        }
      } catch {
        setJobFailed(true);
        toast("Could not follow scoring job", { description: "Check connection, then retry.", variant: "error" });
      } finally {
        setPollingJob(false);
      }
    },
    onError: () => {
      setJobFailed(true);
      toast("Could not start scoring", { description: "Check connection, then retry.", variant: "error" });
    },
  });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
        return data.applications as ApplicationItem[];
      } catch {
        return [] as ApplicationItem[];
      }
    },
  });

  const recs = recsQuery.data ?? [];
  const appliedOfferIds = useMemo(
    () => new Set([...(appsQuery.data ?? []).map((a) => a.opportunity_id), ...applied]),
    [appsQuery.data, applied]
  );

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let list = recs.filter((r) => {
      const o = r.offer;
      if (filters.field && !o.field.toLowerCase().includes(filters.field.trim().toLowerCase())) return false;
      if (filters.region && !o.region.toLowerCase().includes(filters.region.trim().toLowerCase())) return false;
      if (filters.type !== "ALL" && o.type !== filters.type) return false;
      if (q) {
        const hay = `${o.title} ${o.company} ${o.required_skills ?? ""} ${o.field} ${o.region}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (filters.sort === "newest") return String(b.offer.posted_at).localeCompare(String(a.offer.posted_at));
      return (b.score ?? b.ai_score ?? 0) - (a.score ?? a.ai_score ?? 0);
    });
    return list;
  }, [recs, filters]);

  const selected = filtered.find((r) => r.offer.id === selectedId) ?? filtered[0] ?? null;
  const selectedApplied = selected ? appliedOfferIds.has(selected.offer.id) : false;

  function handleGenerate() {
    if (generateMutation.isPending || pollingJob) return;
    setJobFailed(false);
    const profile = (profileQuery.data ?? {}) as { field_of_study?: string | null; city?: string | null };
    const field = filters.field.trim() || profile.field_of_study?.trim();
    const region = filters.region.trim() || profile.city?.trim();
    if (!field || !region) {
      toast("Add a field and region", { description: "Enter both above, or add them to your profile before analyzing matches.", variant: "warning" });
      return;
    }
    generateMutation.mutate({
      field,
      region,
      type: filters.type === "ALL" ? "JOB" : filters.type,
    });
  }

  const loading = recsQuery.isLoading;
  const error = recsQuery.isError;

  return (
    <PageContainer variant="wide">
      <div className={styles.discoverIntro}>
        <div><h1 className="ct-page-title">Discover opportunities</h1><p>Search open roles, then analyze matches for your field and region.</p></div>
        <p>Match analysis appears on each role when it is ready.</p>
      </div>

      <div className={styles.filterPanel}><FilterBar
            filters={filters}
            onChange={(next) => { setFilters(next); setSelectedId(null); }}
            onGenerate={handleGenerate}
            generating={generateMutation.isPending || pollingJob}
          /></div>
      <div className={styles.resultsHeading}><h2>Open roles</h2><p role="status">{loading ? "Loading opportunities" : `${filtered.length} opportunit${filtered.length === 1 ? "y" : "ies"}`}</p></div>
      <div className={styles.resultsLayout}>
        <div className={styles.resultsList}>
          {jobFailed ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
              <p className="text-sm font-semibold text-danger">Match scoring did not complete.</p>
              <button type="button" onClick={handleGenerate} className="mt-2 text-sm font-semibold text-danger underline">
                Retry scoring
              </button>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
              <p className="text-sm font-semibold text-danger">Could not load opportunities.</p>
              <button type="button" onClick={() => recsQuery.refetch()} className="mt-2 text-sm font-semibold text-danger underline">
                Retry
              </button>
            </div>
          ) : null}
          {!error ? (
            <div className={styles.jobList} role="list" aria-label="Opportunities">
              {loading
                ? [1, 2, 3].map((i) => <JobCardSkeleton key={i} />)
                : filtered.map((r) => (
                    <div key={r.id} role="listitem">
                      <JobCard
                        rec={r}
                        selected={selected?.offer.id === r.offer.id}
                        applied={appliedOfferIds.has(r.offer.id)}
                        onSelect={() => setSelectedId(r.offer.id)}
                      />
                    </div>
                  ))}
              {!loading && filtered.length === 0 && recs.length > 0 ? (
                <EmptyState
                  title="No opportunities match these filters"
                  description="Adjust search or clear filters to see more matches."
                  primaryAction={{ label: "Clear filters", onClick: () => setFilters({ query: "", field: "", region: "", type: "ALL", sort: "match" }) }}
                />
              ) : null}
              {!loading && recs.length === 0 ? (
                <EmptyState
                  title="No recommendations yet"
                  description="Enter a field and region, then analyze matches to see roles here."
                  primaryAction={{ label: "Analyze matches", onClick: handleGenerate }}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <div className={`${styles.jobDetail} sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto border border-border-subtle bg-surface p-6`}>
            {loading ? (
              <JobDetailsSkeleton />
            ) : selected ? (
              <JobDetails
                rec={selected}
                applied={selectedApplied}
                onApplied={(id) => setApplied((s) => new Set([...s, id]))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select an opportunity to see details.</p>
            )}
          </div>
        </div>
      </div>

      <Sheet
        open={Boolean(isMobile && selectedId && selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.offer.title ?? "Opportunity"}
        description={selected ? `${selected.offer.company}` : undefined}
        side="bottom"
        size="lg"
      >
        <div className="lg:hidden">
          {selected ? (
            <JobDetails
              rec={selected}
              applied={selectedApplied}
              onApplied={(id) => setApplied((s) => new Set([...s, id]))}
            />
          ) : null}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mt-4 w-full rounded-lg border border-border px-4 py-3 text-sm font-semibold text-foreground"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            Back to results
          </button>
        </div>
      </Sheet>
    </PageContainer>
  );
}
