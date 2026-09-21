"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiBriefcase, FiSearch, FiX } from "react-icons/fi";
import { PageContainer } from "@/components/shell/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationCard, ApplicationDetail, applicationName } from "./application-card";
import type { ApplicationItem, RecruitmentChatListItem } from "@/lib/types";
import styles from "./applications.module.css";

type Filter = "all" | "in-progress" | "assessment" | "interview" | "decisions";
type Sort = "recent" | "applied" | "company";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In progress" },
  { id: "assessment", label: "Assessment" },
  { id: "interview", label: "Interview" },
  { id: "decisions", label: "Decisions" },
];

function matchesFilter(app: ApplicationItem, filter: Filter) {
  const status = app.status.toLowerCase();
  if (filter === "all") return true;
  if (filter === "in-progress") return !["accepted", "offer", "rejected"].includes(status);
  if (filter === "assessment") return status.startsWith("assessment_");
  if (filter === "interview") return status === "interview";
  return ["accepted", "offer", "rejected"].includes(status);
}

function time(value?: string | null) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ApplicationsWorkspace({
  applications,
  chats,
  loading = false,
  error = false,
  onRetry,
}: {
  applications: ApplicationItem[];
  chats: RecruitmentChatListItem[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const detailId = searchParams.get("app");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNarrow, setIsNarrow] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const chatByApp = useMemo(() => new Map(chats.map((chat) => [chat.application_id, chat])), [chats]);
  const visible = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const list = applications.filter((app) => {
      if (!matchesFilter(app, filter)) return false;
      if (!query) return true;
      const { title, company } = applicationName(app, chatByApp.get(app.id));
      return `${title} ${company}`.toLocaleLowerCase().includes(query);
    });
    return list.sort((a, b) => {
      if (sort === "company") return applicationName(a, chatByApp.get(a.id)).company.localeCompare(applicationName(b, chatByApp.get(b.id)).company);
      if (sort === "applied") return time(a.created_at) - time(b.created_at);
      return time(b.updated_at ?? b.created_at) - time(a.updated_at ?? a.created_at);
    });
  }, [applications, chatByApp, filter, searchQuery, sort]);

  const selected = visible.find((app) => app.id === detailId) ?? visible[0] ?? null;
  const mobileDetail = applications.find((app) => app.id === detailId) ?? null;
  const progressCount = applications.filter((app) => matchesFilter(app, "in-progress")).length;
  const decisionCount = applications.filter((app) => matchesFilter(app, "decisions")).length;
  const fatalError = error && applications.length === 0;

  function closeDetail() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("app");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearSearch() {
    composing.current = false;
    setSearchDraft("");
    setSearchQuery("");
    inputRef.current?.focus();
  }

  return (
    <PageContainer variant="wide" className={styles.workspace}>
      <div className={styles.pageHeader}>
        <div><span className={styles.eyebrow}>Your career activity</span><h1>Applications</h1><p>See where each role stands and what to do next.</p></div>
        <a className={styles.discoverLink} href="/dashboard/recommendations">Discover jobs <span aria-hidden>↗</span></a>
      </div>

      <dl className={styles.overview} aria-label="Application overview">
        <div><dt>Applications</dt><dd>{loading || fatalError ? "—" : applications.length}</dd></div>
        <div><dt>In progress</dt><dd>{loading || fatalError ? "—" : progressCount}</dd></div>
        <div><dt>Decisions</dt><dd>{loading || fatalError ? "—" : decisionCount}</dd></div>
      </dl>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FiSearch aria-hidden className={styles.searchIcon} />
          <Input
            ref={inputRef}
            label="Search applications"
            placeholder="Job title or company"
            value={searchDraft}
            onChange={(event) => { setSearchDraft(event.target.value); if (!composing.current) setSearchQuery(event.target.value); }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(event) => { composing.current = false; setSearchQuery(event.currentTarget.value); }}
            className={styles.searchInput}
          />
          {searchDraft ? <button type="button" className={styles.clearSearch} onClick={clearSearch} aria-label="Clear application search"><FiX aria-hidden /></button> : null}
        </div>
        <Select label="Sort by" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className={styles.sortSelect}>
          <option value="recent">Recently updated</option>
          <option value="applied">Oldest applied</option>
          <option value="company">Company A–Z</option>
        </Select>
      </div>

      <div className={styles.filters} role="group" aria-label="Filter applications by stage">
        {filters.map((item) => {
          const count = applications.filter((app) => matchesFilter(app, item.id)).length;
          return <button key={item.id} type="button" className={filter === item.id ? styles.filterActive : styles.filter} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{count}</span></button>;
        })}
      </div>

      {error && applications.length > 0 ? <div role="alert" className={styles.staleNotice}><span>Could not refresh applications. Showing your last loaded results.</span><button type="button" onClick={onRetry}>Retry</button></div> : null}

      {loading ? (
        <div className={styles.loadingLayout} role="status" aria-label="Loading applications"><div><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div><Skeleton className="h-[34rem]" /></div>
      ) : fatalError ? (
        <div role="alert" className={styles.errorState}><h2>Could not load applications</h2><p>Check your connection and try again.</p><button type="button" onClick={onRetry}>Retry loading</button></div>
      ) : applications.length === 0 ? (
        <EmptyState icon={FiBriefcase} title="No applications yet" description="Once you apply for a role, you can follow it here." headingLevel={2} primaryAction={{ label: "Discover opportunities", href: "/dashboard/recommendations" }} />
      ) : visible.length === 0 ? (
        <div className={styles.noResults}><h2>No matching applications</h2><p>Try another search or stage filter.</p><button type="button" onClick={() => { setFilter("all"); clearSearch(); }}>Clear filters</button></div>
      ) : (
        <div className={styles.workspaceGrid}>
          <section className={styles.listPane} aria-labelledby="applications-heading">
            <div className={styles.listHeading}><h2 id="applications-heading">Your roles</h2><span>{visible.length} of {applications.length}</span></div>
            <ul className={styles.applicationList} aria-label="Applications">
              {visible.map((app) => <li key={app.id}><ApplicationCard app={app} chat={chatByApp.get(app.id)} selected={isNarrow === true ? detailId === app.id : selected?.id === app.id} pathname={pathname} /></li>)}
            </ul>
          </section>
          <section className={styles.detailPane} aria-label="Selected application details">
            {selected ? <ApplicationDetail app={selected} chat={chatByApp.get(selected.id)} /> : null}
          </section>
        </div>
      )}

      <Sheet
        open={isNarrow === true && Boolean(mobileDetail)}
        onClose={closeDetail}
        title={mobileDetail ? applicationName(mobileDetail, chatByApp.get(mobileDetail.id)).title : "Application"}
        description={mobileDetail ? applicationName(mobileDetail, chatByApp.get(mobileDetail.id)).company : undefined}
        side="right"
        size="md"
      >
        {mobileDetail ? <ApplicationDetail app={mobileDetail} chat={chatByApp.get(mobileDetail.id)} showTitle={false} /> : null}
      </Sheet>
    </PageContainer>
  );
}
