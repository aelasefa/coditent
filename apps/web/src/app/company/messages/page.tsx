"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
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
  const chatsQ = useQuery({ queryKey: ["company-recruitment-chats"], queryFn: listRecruitmentChats, enabled: !!me });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("app"));

  useEffect(() => {
    const a = searchParams.get("app");
    if (a) setSelectedId(a);
  }, [searchParams]);

  const chats = chatsQ.data ?? [];
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
          title="Messages"
          subtitle="Recruitment conversations for applications you are responsible for."
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{chats.length} threads</span>}
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
        ) : chats.length === 0 ? (
          <EmptyState
            icon={FiMessageSquare}
            title="No conversations yet"
            description="Threads appear here once candidates you are responsible for unlock chat by advancing stages."
            primaryAction={{ label: "Open pipeline", href: "/company/candidates" }}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div>
              <div className="relative mb-2">
                <label htmlFor="company-msg-search" className="sr-only">Search conversations</label>
                <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="company-msg-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidate, job, message"
                  className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <ul className="space-y-2" aria-label="Conversations">
                {filtered.map((c) => {
                  const active = selected?.application_id === c.application_id;
                  return (
                    <li key={c.application_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.application_id)}
                        aria-current={active ? "true" : undefined}
                        aria-label={`Open conversation with ${c.peer?.full_name ?? "candidate"} for ${c.offer_title}`}
                        className={active ? "flex w-full items-center gap-3 rounded-xl border border-primary bg-surface p-3 text-left ring-2 ring-primary/20" : "flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3 text-left hover:border-border-strong"}
                      >
                        <Avatar name={c.peer?.full_name ?? c.offer_title} size="md" src={c.peer?.avatar_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {c.peer?.full_name ?? "Candidate"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.offer_title} · {c.last_message || c.status.replace(/_/g, " ")}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={c.status} size="sm" />
                          <span className="text-[11px] text-muted-foreground">{timeLabel(c.last_at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filtered.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">No threads match search.</p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground lg:hidden">Select a thread to open conversation.</p>
            </div>

            <div className="hidden min-h-125 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface lg:flex">
              {selected ? (
                <>
                  <div className="border-b border-border-subtle px-4 py-3">
                    <p className="truncate text-sm font-bold text-foreground">
                      {selected.peer?.full_name ?? "Candidate"} · {selected.offer_title}
                    </p>
                    <p className="text-xs text-muted-foreground">{selected.status.replace(/_/g, " ")}</p>
                  </div>
                  <RecruitmentThread applicationId={selected.application_id} peerName={selected.peer?.full_name ?? "candidate"} />
                </>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">Select a conversation.</p>
              )}
            </div>

            <div className="lg:hidden">
              {selected && (
                <div className="rounded-xl border border-border-subtle bg-surface">
                  <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                    <p className="truncate text-sm font-bold">{selected.peer?.full_name ?? "Candidate"}</p>
                    <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                      Back to list
                    </button>
                  </div>
                  {selectedId && <RecruitmentThread applicationId={selectedId} peerName={selected.peer?.full_name ?? "candidate"} />}
                </div>
              )}
            </div>
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
