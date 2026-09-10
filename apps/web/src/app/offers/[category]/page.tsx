"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getOffers } from "@/lib/api";
import { categories, type CategorySlug } from "@/lib/categories";
import type { Offer } from "@/lib/types";
import { SiteHeader } from "@/components/landing/site-header";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

function inferCategory(offer: Offer): CategorySlug {
  const searchable = `${offer.title} ${offer.company} ${offer.field} ${offer.description} ${offer.requirements}`.toLowerCase();
  if (searchable.includes("design")) return "design";
  if (searchable.includes("data") || searchable.includes("analytics") || searchable.includes("bi")) return "data";
  if (searchable.includes("recruit") || searchable.includes("operation") || searchable.includes("hr") || searchable.includes("support") || searchable.includes("success")) {
    return "operations";
  }
  return "engineering";
}

function salaryLabel(o: Offer): string | null {
  if (o.salary_min == null && o.salary_max == null) return null;
  if (o.salary_min != null && o.salary_max != null) return `${o.salary_min.toLocaleString()} – ${o.salary_max.toLocaleString()}`;
  if (o.salary_min != null) return `From ${o.salary_min.toLocaleString()}`;
  return `Up to ${Number(o.salary_max).toLocaleString()}`;
}

function OffersContent() {
  const router = useRouter();
  const params = useParams<{ category?: string }>();
  const categoryParam = Array.isArray(params?.category) ? params?.category[0] : params?.category;
  const categorySlug = (categoryParam ?? "all") as CategorySlug;
  const category = categories.find((item) => item.slug === categorySlug) ?? categories[categories.length - 1];

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(false);
    getOffers()
      .then((list) => {
        if (!mounted) return;
        const filtered = category.slug === "all" ? list : list.filter((o) => inferCategory(o) === category.slug);
        setOffers(filtered);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadError(true);
        setOffers([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [category.slug]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((o) =>
      `${o.title} ${o.company} ${o.region} ${o.field} ${o.required_skills ?? ""}`.toLowerCase().includes(q)
    );
  }, [offers, search]);

  const returnPath = `/offers/${category.slug}`;

  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <button type="button" onClick={() => router.back()} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open opportunities</p>
          <h1 className="ct-page-title mt-1">{category.label} opportunities</h1>
          <p className="mt-1 text-sm text-muted-foreground" role="status">
            {loading ? "Loading roles" : `${visible.length} open role${visible.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="mt-5 max-w-md">
          <label htmlFor="public-search" className="sr-only">Search opportunities</label>
          <input
            id="public-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, field, region"
            className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {loading ? (
          <div className="mt-5 space-y-2.5" role="status" aria-label="Loading opportunities">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load opportunities.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Check connection, then retry.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={offers.length === 0 ? "No open roles in this category" : "No roles match search"}
              description={offers.length === 0 ? "New roles appear here when companies publish." : "Adjust search terms."}
              primaryAction={offers.length === 0 ? undefined : { label: "Clear search", onClick: () => setSearch("") }}
            />
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5" aria-label="Opportunities">
            {visible.map((o) => {
              const expanded = expandedId === o.id;
              const salary = salaryLabel(o);
              return (
                <li key={o.id} className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : o.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-secondary/40"
                  >
                    <Avatar name={o.company} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{o.title}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {o.company} · {o.region} · {o.type === "INTERNSHIP" ? "Internship" : "Job"}
                        {o.work_mode ? ` · ${o.work_mode}` : ""} · {new Date(o.posted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-border-subtle px-4 py-4 sm:px-5">
                      <h2 className="text-sm font-semibold">About the role</h2>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground-secondary">{o.description || "No description provided."}</p>
                      {o.requirements && (
                        <>
                          <h2 className="mt-4 text-sm font-semibold">Requirements</h2>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground-secondary">{o.requirements}</p>
                        </>
                      )}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                        <span>Field: {o.field}</span>
                        {salary && <span>Salary: {salary}</span>}
                        {o.deadline && <span>Apply by {new Date(o.deadline).toLocaleDateString()}</span>}
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Link
                          href={`/login?next=${encodeURIComponent(returnPath)}`}
                          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                        >
                          Sign in to apply
                        </Link>
                        <Link
                          href={`/register`}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong px-5 text-sm font-semibold hover:bg-surface-secondary"
                        >
                          Create account
                        </Link>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Applying needs an account. You return here after signing in.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function CategoryOffersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Loading opportunities</p>}>
      <OffersContent />
    </Suspense>
  );
}

