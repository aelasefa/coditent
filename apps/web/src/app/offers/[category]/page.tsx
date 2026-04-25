"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getOffers } from "@/lib/api";
import { categories, type CategorySlug } from "@/lib/categories";
import type { Offer } from "@/lib/types";
import styles from "./page.module.css";

type OffersJob = {
  id: string;
  title: string;
  company: string;
  city: string;
  mode: string;
  salary: string;
  category: string;
  description: string;
};

const fallbackJobs = [
  {
    id: "f1",
    title: "Senior Frontend Engineer",
    company: "Atlas Systems",
    city: "Casablanca",
    mode: "Hybrid",
    salary: "28K-36K MAD",
    category: "engineering",
    description: "Own frontend architecture and design-system quality.",
  },
  {
    id: "f2",
    title: "Product Designer",
    company: "Blue Dune",
    city: "Rabat",
    mode: "Remote",
    salary: "22K-30K MAD",
    category: "design",
    description: "Design trust-heavy onboarding and operations flows.",
  },
  {
    id: "f3",
    title: "Data Analyst",
    company: "Nomad Data",
    city: "Tangier",
    mode: "Hybrid",
    salary: "18K-25K MAD",
    category: "data",
    description: "Turn funnel metrics into executive-ready insight.",
  },
  {
    id: "f4",
    title: "Technical Recruiter",
    company: "Harbor SaaS",
    city: "Casablanca",
    mode: "On-site",
    salary: "16K-22K MAD",
    category: "operations",
    description: "Partner with hiring managers and improve throughput.",
  },
  {
    id: "f5",
    title: "Backend Engineer",
    company: "Northstar Labs",
    city: "Rabat",
    mode: "Hybrid",
    salary: "24K-34K MAD",
    category: "engineering",
    description: "Build APIs and ranking pipelines for recruiter workflows.",
  },
  {
    id: "f6",
    title: "Customer Success Lead",
    company: "Mosaic Group",
    city: "Marrakech",
    mode: "On-site",
    salary: "18K-26K MAD",
    category: "success",
    description: "Lead onboarding quality and recruiter adoption.",
  },
];

const companyColors: Record<string, string> = {
  "Atlas Systems": "#4f46e5",
  "Blue Dune": "#0891b2",
  "Nomad Data": "#059669",
  "Harbor SaaS": "#d97706",
  "Northstar Labs": "#7c3aed",
  "Mosaic Group": "#db2777",
};

function getCompanyColor(name: string) {
  return companyColors[name] ?? "#6b5f7a";
}

function getModeClass(mode: string, classMap: Record<string, string>) {
  if (mode === "Remote") return classMap.modeRemote;
  if (mode === "Hybrid") return classMap.modeHybrid;
  return classMap.modeOnsite;
}

function getFallback(category: string): OffersJob[] {
  if (category === "all") {
    return fallbackJobs;
  }

  return fallbackJobs.filter((job) => job.category === category);
}

function inferCategory(offer: Offer): CategorySlug {
  const searchable = `${offer.title} ${offer.company} ${offer.field} ${offer.description} ${offer.requirements}`.toLowerCase();

  if (searchable.includes("design")) return "design";
  if (searchable.includes("data") || searchable.includes("analytics") || searchable.includes("bi")) return "data";
  if (
    searchable.includes("recruit") ||
    searchable.includes("operation") ||
    searchable.includes("hr") ||
    searchable.includes("support") ||
    searchable.includes("success")
  ) {
    return "operations";
  }
  if (searchable.includes("success") || searchable.includes("customer")) return "success";
  return "engineering";
}

function mapOfferToJob(offer: Offer): OffersJob {
  const fallbackMatch = fallbackJobs.find(
    (job) => job.title === offer.title && job.company === offer.company
  );

  return {
    id: offer.id,
    title: offer.title,
    company: offer.company,
    city: offer.region,
    mode: offer.type === "INTERNSHIP" ? "On-site" : "Hybrid",
    salary: fallbackMatch?.salary ?? "—",
    category: inferCategory(offer),
    description: offer.description,
  };
}

export default function CategoryOffersPage() {
  const router = useRouter();
  const params = useParams<{ category?: string }>();
  const categoryParam = Array.isArray(params?.category) ? params?.category[0] : params?.category;
  const categorySlug = (categoryParam ?? "all") as CategorySlug;

  const category = categories.find((item) => item.slug === categorySlug) ?? categories[categories.length - 1];
  const resolvedCategorySlug = category.slug;

  const [jobs, setJobs] = useState<OffersJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "salary">("recent");
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getOffers()
      .then((offers) => {
        if (!mounted) return;

        const mapped = offers.map(mapOfferToJob);
        const categoryFiltered =
          resolvedCategorySlug === "all"
            ? mapped
            : mapped.filter((job) => job.category === resolvedCategorySlug);

        if (categoryFiltered.length === 0) {
          setJobs(getFallback(resolvedCategorySlug));
          setUsedFallback(true);
          return;
        }

        setJobs(categoryFiltered);
        setUsedFallback(false);
      })
      .catch(() => {
        if (!mounted) return;

        setJobs(getFallback(resolvedCategorySlug));
        setUsedFallback(true);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [resolvedCategorySlug]);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          job.city.toLowerCase().includes(query)
      );
    }

    if (sortBy === "salary") {
      result.sort((left, right) => {
        const parseSalary = (value: string) => parseInt(value.replace(/[^0-9]/g, ""), 10) || 0;
        return parseSalary(right.salary) - parseSalary(left.salary);
      });
    }

    return result;
  }, [jobs, search, sortBy]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.back()} type="button">
          ← Back to categories
        </button>

        <div className={styles.offersHeader}>
          <span className={styles.offersEmoji} style={{ background: category.bg }}>
            {category.emoji}
          </span>
          <div>
            <p className={styles.eyebrow}>ROLE STREAM</p>
            <h1 className={styles.offersTitle}>
              {category.label} <span className={styles.underlineWord}>opportunities.</span>
            </h1>
            <p className={styles.offersSub}>
              {jobs.length} active role{jobs.length !== 1 ? "s" : ""} · Morocco · Updated weekly
            </p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              placeholder="Search by title, company, or city..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button className={styles.clearBtn} onClick={() => setSearch("")} type="button">
                ×
              </button>
            ) : null}
          </div>
          <div className={styles.sortWrap}>
            <button
              className={`${styles.sortBtn} ${sortBy === "recent" ? styles.sortActive : ""}`}
              onClick={() => setSortBy("recent")}
              type="button"
            >
              Recent
            </button>
            <button
              className={`${styles.sortBtn} ${sortBy === "salary" ? styles.sortActive : ""}`}
              onClick={() => setSortBy("salary")}
              type="button"
            >
              Top salary
            </button>
          </div>
        </div>

        {usedFallback ? (
          <p className={styles.fallbackNotice}>Showing sample data — live listings coming soon</p>
        ) : null}

        <p className={styles.resultsCount}>
          {filteredJobs.length} result{filteredJobs.length !== 1 ? "s" : ""}
        </p>

        <div className={styles.table}>
          <div className={styles.tableHead}>
            <span>JOB</span>
            <span>COMPANY</span>
            <span>LOCATION</span>
            <span>SALARY</span>
            <span>MODE</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={`${styles.jobRow} ${styles.skeleton}`} />
            ))
          ) : filteredJobs.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <p className={styles.emptyText}>No roles match your search.</p>
              <button className={styles.emptyBtn} onClick={() => setSearch("")} type="button">
                Clear search
              </button>
            </div>
          ) : (
            filteredJobs.map((job, index) => (
              <div
                key={job.id}
                className={styles.jobRow}
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <div className={styles.colJob}>
                  <span className={styles.jobTitle}>{job.title}</span>
                  <span className={styles.jobDesc}>{job.description}</span>
                </div>
                <div className={styles.colCompany}>
                  <span className={styles.companyDot} style={{ background: getCompanyColor(job.company) }} />
                  {job.company}
                </div>
                <div className={styles.colLocation}>📍 {job.city}</div>
                <div className={styles.colSalary}>
                  <span className={styles.salaryChip}>{job.salary}</span>
                </div>
                <div className={styles.colMode}>
                  <span className={`${styles.modeChip} ${getModeClass(job.mode, styles)}`}>
                    {job.mode}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}