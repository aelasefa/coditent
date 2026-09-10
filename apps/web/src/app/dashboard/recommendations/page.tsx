"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api, generateRecommendations, getProfile, getRecommendations } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { FilterBar, type DiscoverFilters } from "@/components/candidate/filter-bar";
import { JobCard, JobCardSkeleton } from "@/components/candidate/job-card";
import { JobDetails, JobDetailsSkeleton } from "@/components/candidate/job-details";
import type { ApplicationItem } from "@/lib/types";

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
  const generateMutation = useMutation({
    mutationFn: generateRecommendations,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
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

  const fields = useMemo(() => [...new Set(recs.map((r) => r.offer.field).filter(Boolean))].sort(), [recs]);
  const regions = useMemo(() => [...new Set(recs.map((r) => r.offer.region).filter(Boolean))].sort(), [recs]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let list = recs.filter((r) => {
      const o = r.offer;
      if (filters.field && o.field !== filters.field) return false;
      if (filters.region && o.region !== filters.region) return false;
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

  const selected = filtered.find((r) => r.offer.id === selectedId) ?? recs.find((r) => r.offer.id === selectedId) ?? filtered[0] ?? null;
  const selectedApplied = selected ? appliedOfferIds.has(selected.offer.id) : false;

  function handleGenerate() {
    const profile = (profileQuery.data ?? {}) as { field_of_study?: string | null; city?: string | null };
    generateMutation.mutate({
      field: filters.field || profile.field_of_study || "Informatique",
      region: filters.region || profile.city || "Casablanca",
      type: filters.type === "ALL" ? "JOB" : filters.type,
    });
  }

  const loading = recsQuery.isLoading || generateMutation.isPending;
  const error = recsQuery.isError;

  return (
    <PageContainer variant="wide">
      <PageHeader title="Discover" description="Opportunities matched to your profile by AI." />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            fields={fields}
            regions={regions}
            onGenerate={handleGenerate}
            generating={generateMutation.isPending}
          />
          <p className="text-[13px] text-muted-foreground" role="status">
            {loading ? "Loading opportunities" : `${filtered.length} opportunit${filtered.length === 1 ? "y" : "ies"}`}
          </p>
          {error ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
              <p className="text-sm font-semibold text-danger">Could not load opportunities.</p>
              <button type="button" onClick={() => recsQuery.refetch()} className="mt-2 text-sm font-semibold text-danger underline">
                Retry
              </button>
            </div>
          ) : null}
          {!error ? (
            <div className="space-y-2.5" role="list" aria-label="Opportunities">
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
                  description="Set field and region, then refresh to generate AI matches."
                  primaryAction={{ label: "Refresh recommendations", onClick: handleGenerate }}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-border-subtle bg-surface p-6">
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
