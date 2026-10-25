"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getMe, listRecruitmentChats } from "@/lib/api";
import { RecruitmentThread } from "@/components/company/RecruitmentThread";
import { FiMessageSquare, FiSearch } from "react-icons/fi";

function timeLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function InboxContent() {
  const searchParams = useSearchParams();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const chatsQ = useQuery({
    queryKey: ["company-recruitment-chats"],
    queryFn: listRecruitmentChats,
    enabled: !!me,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("app"));
  const [desktop, setDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const a = searchParams.get("app");
    if (a) setSelectedId(a);
  }, [searchParams]);

  const chats = useMemo(() => chatsQ.data ?? [], [chatsQ.data]);
  const filtered = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter((c) =>
      [c.peer?.full_name ?? "", c.offer_title ?? "", c.company_name ?? "", c.last_message ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [chats, search]);

  const selected = chats.find((c) => c.application_id === selectedId) ?? filtered[0] ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          tone="green"
          center
          eyebrow="Conversations"
          title="Every conversation, in clear view."
          subtitle="Keep candidate conversations focused, responsive and easy to follow."
        />

        {chatsQ.isLoading ? (
          <div className="space-y-2" role="status" aria-label="Loading conversations">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : chatsQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load conversations.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Only chats for your assigned applications are visible.</p>
            <Button size="sm" variant="outline" onClick={() => chatsQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : (
          <div className="relative flex flex-col md:flex-row h-[calc(100vh-280px)] min-h-[580px] overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-[0_12px_40px_rgb(25_77_56/5%)]">
            {/* Sidebar Inbox */}
            <aside className={`flex flex-col border-r border-border-subtle bg-surface md:w-[350px] lg:w-[380px] shrink-0 ${selectedId && !desktop ? "hidden md:flex" : "flex w-full"}`}>
              {/* Inbox Header */}
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Your Inbox</span>
                  <h2 className="text-lg font-bold text-foreground">Conversations</h2>
                </div>
                <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {chats.length}
                </span>
              </div>

              {/* Search Bar */}
              <div className="p-3 border-b border-border-subtle/60">
                <div className="relative">
                  <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="company-msg-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search candidate, role, message..."
                    className="h-9 w-full rounded-lg border border-border bg-surface-secondary/50 pl-8 pr-3 text-xs focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>

              {/* Thread list */}
              <div className="flex-1 overflow-y-auto">
                {chats.length === 0 ? (
                  <div className="p-8 text-center">
                    <FiMessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs font-semibold text-foreground">No conversations yet</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Threads appear when candidates advance in pipeline.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No matching conversations.
                  </div>
                ) : (
                  <ul className="divide-y divide-border-subtle/70" aria-label="Conversations">
                    {filtered.map((c) => {
                      const active = selected?.application_id === c.application_id;
                      return (
                        <li key={c.application_id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.application_id)}
                            aria-current={active ? "true" : undefined}
                            className={`flex w-full items-start gap-3 p-3.5 text-left transition-colors ${
                              active
                                ? "bg-surface-secondary border-l-4 border-primary"
                                : "hover:bg-surface-secondary/40 border-l-4 border-transparent"
                            }`}
                          >
                            <Avatar name={c.peer?.full_name ?? c.offer_title} size="md" src={c.peer?.avatar_url} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-1">
                                <span className="truncate text-xs font-bold text-foreground">
                                  {c.peer?.full_name ?? "Candidate"}
                                </span>
                                <time className="shrink-0 text-[10px] text-muted-foreground">
                                  {timeLabel(c.last_at)}
                                </time>
                              </div>
                              <p className="truncate text-[11px] font-semibold text-primary mt-0.5">
                                {c.offer_title}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                                {c.last_message || c.status.replace(/_/g, " ")}
                              </p>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <StatusBadge status={c.status} size="sm" />
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            {/* Main Chat Thread Area */}
            <main className={`flex-1 flex flex-col min-w-0 bg-surface ${!selectedId && !desktop ? "hidden md:flex" : "flex"}`}>
              {selected ? (
                <>
                  {/* Chat Top Header */}
                  <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 bg-surface">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Mobile Back Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-border text-xs font-bold text-primary hover:bg-surface-secondary"
                        aria-label="Back to conversations"
                      >
                        ←
                      </button>
                      <Avatar name={selected.peer?.full_name ?? "Candidate"} src={selected.peer?.avatar_url} size="md" />
                      <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-primary">In conversation with</span>
                        <h2 className="truncate text-sm font-bold text-foreground leading-tight">
                          {selected.peer?.full_name ?? "Candidate"}
                        </h2>
                        <p className="truncate text-xs text-muted-foreground">
                          {selected.offer_title} · <span className="font-medium text-foreground">{selected.status.replace(/_/g, " ")}</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={selected.status} size="sm" />
                    </div>
                  </div>

                  {/* Message Thread Content */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <RecruitmentThread applicationId={selected.application_id} peerName={selected.peer?.full_name ?? "candidate"} />
                  </div>
                </>
              ) : (
                /* Welcome Empty Slate */
                <div className="relative flex flex-1 flex-col items-center justify-center p-8 text-center overflow-hidden">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-primary shadow-sm">
                    <FiMessageSquare className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Stay Connected</span>
                  <h2 className="mt-1 font-serif text-2xl text-foreground">Select a conversation</h2>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Choose a candidate thread from the left to read messages and reply in real time.
                  </p>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function CompanyMessagesPage() {
  return (
    <Suspense fallback={<AppShell><p className="p-6 text-sm text-muted-foreground" role="status">Loading messages</p></AppShell>}>
      <InboxContent />
    </Suspense>
  );
}
