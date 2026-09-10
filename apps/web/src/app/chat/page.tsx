"use client";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FiMessageSquare } from "react-icons/fi";
import { getConversations, getMe, listRecruitmentChats } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationStage } from "@/components/candidate/application-stage";

function timeLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function InboxContent() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const convQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversations });
  const recQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });
  const loading = convQuery.isLoading || recQuery.isLoading;
  const error = convQuery.isError || recQuery.isError;
  const recruitment = recQuery.data ?? [];
  const general = convQuery.data ?? [];
  const isCandidate = (meQuery.data?.role ?? "CANDIDATE") === "CANDIDATE";

  return (
    <PageContainer>
      <PageHeader title="Messages" description="Recruiter conversations linked to applications." />
      {loading ? (
        <div className="space-y-2" role="status" aria-label="Loading conversations">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4">
          <p className="text-sm font-semibold text-danger">Could not load conversations.</p>
          <button type="button" onClick={() => { convQuery.refetch(); recQuery.refetch(); }} className="mt-2 text-sm font-semibold text-danger underline">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <section aria-label="Recruitment conversations">
            <h2 className="ct-section-title">Recruitment</h2>
            {recruitment.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={FiMessageSquare}
                  title="No recruiter conversations yet"
                  description="Recruiter conversations appear after communication becomes available for an application. Not every application unlocks chat."
                />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {recruitment.map((c) => (
                  <li key={c.application_id}>
                    <Link
                      href={`/chat/recruitment/${c.application_id}`}
                      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 hover:border-border-strong"
                    >
                      <Avatar name={c.peer?.full_name ?? c.company_name ?? c.offer_title} size="md" src={c.peer?.avatar_url} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {c.offer_title} · {c.peer?.full_name ?? "Recruiter"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.company_name ?? ""} {c.last_message ? `· ${c.last_message}` : `· ${c.status.replace(/_/g, " ")}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <ApplicationStage status={c.status} />
                        <span className="text-[11px] text-muted-foreground">{timeLabel(c.last_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Other conversations">
            <h2 className="ct-section-title">Other</h2>
            {(general ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No other conversations.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(general ?? []).map((c) => (
                  <li key={c.user.id}>
                    <Link
                      href={`/chat/${c.user.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 hover:border-border-strong"
                    >
                      <Avatar name={c.user.full_name} size="md" src={c.user.avatar_url} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {c.user.full_name}{isCandidate ? "" : ` · ${c.user.role}`}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.last_message || "No messages yet"}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(c.last_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}

export default function ChatListPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Loading messages</p>}>
      <InboxContent />
    </Suspense>
  );
}
