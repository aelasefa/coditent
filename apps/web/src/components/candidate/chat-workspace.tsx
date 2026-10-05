"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiArrowUpRight, FiBriefcase, FiMessageCircle, FiSearch, FiX } from "react-icons/fi";
import { getCombinedInbox } from "@/lib/api";
import { filterInbox, mapCombinedInbox, type InboxFilter as Filter, type InboxItem as Conversation } from "@/lib/friend-ui";
import { stageLabel } from "@/components/candidate/application-stage";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatParticipantProfileContent, type ChatParticipantProfile } from "./chat-participant-profile";
import styles from "./chat-workspace.module.css";

const ChatProfileContext = createContext<{
  open: boolean;
  panelId: string;
  toggle: (trigger: HTMLButtonElement) => void;
} | null>(null);

export function useChatProfilePanel() {
  return useContext(ChatProfileContext);
}

function dateLabel(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChatInbox({ activeHref }: { activeHref?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const inboxQuery = useQuery({ queryKey: ["conversation-inbox"], queryFn: getCombinedInbox });
  const loading = inboxQuery.isLoading;
  const error = inboxQuery.isError;

  const conversations = useMemo<Conversation[]>(() => mapCombinedInbox(inboxQuery.data ?? []), [inboxQuery.data]);
  const visible = filterInbox(conversations, filter, search);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "recruitment", label: "Recruitment" },
    { id: "friend", label: "Friends" },
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
            <button type="button" onClick={() => inboxQuery.refetch()}>Retry</button>
          </div>
        ) : conversations.length === 0 ? (
          <div className={styles.inboxNotice}>
            <FiMessageCircle aria-hidden="true" />
            <strong>No conversations yet</strong>
            <p>Friend and recruitment conversations will appear here.</p>
            <Link href="/dashboard/friends">Find candidates <FiArrowUpRight aria-hidden="true" /></Link>
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
                    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
                      {item.badge}
                      {item.unreadCount > 0 ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount}</span> : null}
                    </span>
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

export function ChatWorkspace({ activeHref, profile, children }: { activeHref?: string; profile?: ChatParticipantProfile | null; children?: React.ReactNode }) {
  // Scope the disclosure to a participant and conversation, including client-side route changes.
  const profileKey = activeHref && profile ? `${activeHref}:${profile.id}` : null;
  const [openProfileKey, setOpenProfileKey] = useState<string | null>(null);
  const profileOpen = Boolean(profileKey && openProfileKey === profileKey);
  const panelId = useId();
  const panelTitleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setOpenProfileKey(null); }, [profileKey]);

  const closeProfile = useCallback((restoreFocus = true) => {
    setOpenProfileKey(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    const isWithinProfile = (target: EventTarget | null) => target instanceof Node && (
      panelRef.current?.contains(target) || triggerRef.current?.contains(target)
    );
    const onPointerDown = (event: PointerEvent) => {
      if (!isWithinProfile(event.target)) closeProfile(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isWithinProfile(event.target)) closeProfile(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeProfile();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen, closeProfile]);

  const profileControl = profile ? {
    open: profileOpen,
    panelId,
    toggle: (trigger: HTMLButtonElement) => {
      triggerRef.current = trigger;
      setOpenProfileKey((current) => current === profileKey ? null : profileKey);
    },
  } : null;

  return (
    <ChatProfileContext.Provider value={profileControl}>
    <PageContainer variant="wide" className={styles.page}>
      <div className={styles.pageHeading}>
        <div><span className={styles.eyebrow}>Career conversations</span><h1>Messages</h1><p>Keep friend and application conversations in one place.</p></div>
      </div>
      <div className={`${styles.workspace} ${activeHref ? styles.workspaceWithThread : ""} ${profileOpen ? styles.workspaceWithProfile : ""}`}>
        <ChatInbox activeHref={activeHref} />
        <section className={styles.thread} aria-label={activeHref ? "Selected conversation" : "Conversation"}>
          {children ?? <div className={styles.welcome}>
            <div className={styles.welcomeMark}><FiBriefcase aria-hidden="true" /></div>
            <span className={styles.eyebrow}>Stay connected</span>
            <h2>Your next conversation starts here.</h2>
            <p>Choose a friend or recruitment conversation to continue where you left off.</p>
            <Link href="/dashboard/friends">Find candidates <FiArrowUpRight aria-hidden="true" /></Link>
          </div>}
        </section>
        {profile ? (
          <>
            <div className={styles.profileBackdrop} aria-hidden="true" />
            <div className={styles.profileSlot}>
              {/* Non-modal companion panel; keep it mounted so closing reverses the entrance. */}
              <aside
                id={panelId}
                ref={(node) => {
                  panelRef.current = node;
                  // React 18 does not forward the boolean inert attribute reliably.
                  if (node) node.inert = !profileOpen;
                }}
                aria-labelledby={panelTitleId}
                aria-hidden={!profileOpen}
                className={styles.profilePanel}
              >
                <div className={styles.profilePanelHeader}>
                  <h2 id={panelTitleId}>Conversation profile</h2>
                  <button ref={closeButtonRef} type="button" onClick={() => closeProfile()} aria-label="Close profile panel" title="Close profile panel" className={styles.profileIconButton}>
                    <FiX aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.profilePanelBody}>
                  <ChatParticipantProfileContent key={profileKey} profile={profile} active={profileOpen} />
                </div>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </PageContainer>
    </ChatProfileContext.Provider>
  );
}
