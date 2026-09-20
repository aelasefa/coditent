"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiArrowUpRight, FiBriefcase, FiMessageCircle, FiSearch, FiX } from "react-icons/fi";
import { getConversations, listRecruitmentChats } from "@/lib/api";
import { stageLabel } from "@/components/candidate/application-stage";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./chat-workspace.module.css";

type Filter = "all" | "recruitment" | "other";
type Conversation = {
  href: string;
  kind: Exclude<Filter, "all">;
  name: string;
  avatar?: string | null;
  context: string;
  detail: string;
  preview: string;
  date?: string | null;
  stage?: string;
};

function dateLabel(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateValue(iso?: string | null): number {
  const value = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(value) ? 0 : value;
}

function ChatInbox({ activeHref }: { activeHref?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const recruitmentQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });
  const generalQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversations });
  const loading = recruitmentQuery.isLoading || generalQuery.isLoading;
  const error = recruitmentQuery.isError || generalQuery.isError;

  const conversations = useMemo<Conversation[]>(() => {
    // Canonical recruitment inbox: exactly ONE entry per application_id.
    // Stage changes update the existing entry's metadata (status/preview);
    // they never append a second row. Defensive dedupe here mirrors the
    // backend guard in GET /chat/recruitment.
    const seenApplications = new Set<string>();
    const recruitment: Conversation[] = [];
    for (const item of recruitmentQuery.data ?? []) {
      if (seenApplications.has(item.application_id)) continue;
      seenApplications.add(item.application_id);
      recruitment.push({
        href: `/chat/recruitment/${item.application_id}`,
        kind: "recruitment",
        name: item.peer?.full_name ?? item.company_name ?? "Recruitment team",
        avatar: item.peer?.avatar_url,
        context: item.offer_title,
        detail: item.company_name ?? "Recruitment conversation",
        preview: item.last_message ?? (item.chat_enabled ? "Open conversation" : "Chat available after application progresses"),
        date: item.last_at,
        stage: item.status,
      });
    }
    const general: Conversation[] = (generalQuery.data ?? []).map((item) => ({
      href: `/chat/${item.user.id}`,
      kind: "other",
      name: item.user.full_name,
      avatar: item.user.avatar_url,
      context: "Career connection",
      detail: "Direct conversation",
      preview: item.last_message || "No messages yet",
      date: item.last_at,
    }));
    return [...recruitment, ...general].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [recruitmentQuery.data, generalQuery.data]);

  const visible = conversations.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || [item.name, item.context, item.detail, item.preview].some((part) => part.toLocaleLowerCase().includes(term));
  });

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "recruitment", label: "Recruitment" },
    { id: "other", label: "Other" },
  ];

  return (
    <aside className={styles.inbox} aria-label="Conversations">
      <div className={styles.inboxHeader}>
        <div><span className={styles.eyebrow}>Your inbox</span><h2>Conversations</h2></div>
        {!loading && !error ? <span className={styles.count} aria-label={`${conversations.length} conversations`}>{conversations.length}</span> : null}
      </div>
      <div className={styles.searchWrap}>
        <FiSearch aria-hidden="true" />
        <label htmlFor="conversation-search" className="sr-only">Search conversations</label>
        <input id="conversation-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" />
        {search ? <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); document.getElementById("conversation-search")?.focus(); }}><FiX aria-hidden="true" /></button> : null}
      </div>
      <div className={styles.filters} aria-label="Conversation type">
        {filters.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className={styles.inboxBody}>
        {loading ? (
          <div className={styles.skeletonList} role="status" aria-label="Loading conversations">
            {[1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)}
          </div>
        ) : error ? (
          <div className={styles.inboxNotice} role="alert">
            <strong>Could not load conversations.</strong>
            <button type="button" onClick={() => { recruitmentQuery.refetch(); generalQuery.refetch(); }}>Retry</button>
          </div>
        ) : conversations.length === 0 ? (
          <div className={styles.inboxNotice}>
            <FiMessageCircle aria-hidden="true" />
            <strong>No conversations yet</strong>
            <p>When a recruiter can message you about an application, it will appear here.</p>
            <Link href="/dashboard/applications">View applications <FiArrowUpRight aria-hidden="true" /></Link>
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.inboxNotice} role="status">
            <strong>No matching conversations</strong>
            <p>Try a different name, role, or filter.</p>
            <button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>
          </div>
        ) : (
          <ul className={styles.conversationList}>
            {visible.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={activeHref === item.href ? "page" : undefined} className={styles.conversationRow}>
                  <Avatar name={item.name} src={item.avatar} size="md" />
                  <span className={styles.rowText}>
                    <span className={styles.rowTop}><strong>{item.name}</strong><time dateTime={item.date ?? undefined} suppressHydrationWarning>{dateLabel(item.date)}</time></span>
                    <span className={styles.rowContext}>{item.context}</span>
                    <span className={styles.rowDetail}>{item.detail}{item.stage ? ` · ${stageLabel(item.stage)}` : ""}</span>
                    <span className={styles.rowPreview}>{item.preview}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function ChatWorkspace({ activeHref, children }: { activeHref?: string; children?: React.ReactNode }) {
  return (
    <PageContainer variant="wide" className={styles.page}>
      <div className={styles.pageHeading}>
        <div><span className={styles.eyebrow}>Career conversations</span><h1>Messages</h1><p>Keep every application conversation in one place.</p></div>
      </div>
      <div className={`${styles.workspace} ${activeHref ? styles.workspaceWithThread : ""}`}>
        <ChatInbox activeHref={activeHref} />
        <section className={styles.thread} aria-label={activeHref ? "Selected conversation" : "Conversation"}>
          {children ?? <div className={styles.welcome}>
            <div className={styles.welcomeMark}><FiBriefcase aria-hidden="true" /></div>
            <span className={styles.eyebrow}>Stay connected</span>
            <h2>Your next conversation starts here.</h2>
            <p>Choose a conversation to follow up on a role, or track your applications while you wait for a reply.</p>
            <Link href="/dashboard/applications">View applications <FiArrowUpRight aria-hidden="true" /></Link>
          </div>}
        </section>
      </div>
    </PageContainer>
  );
}
