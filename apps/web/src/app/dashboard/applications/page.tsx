"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, listRecruitmentChats } from "@/lib/api";
import type { ApplicationItem, RecruitmentChatListItem } from "@/lib/types";

function stageLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CandidateApplicationsPage() {
  const { data: apps, isLoading } = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
      return data.applications;
    },
  });
  const { data: chats } = useQuery({
    queryKey: ["my-recruitment-chats"],
    queryFn: listRecruitmentChats,
  });
  const chatByApp = new Map((chats ?? []).map((c: RecruitmentChatListItem) => [c.application_id, c]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-100">My Applications</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Track each application and chat with the responsible recruiter once it progresses.
      </p>

      {isLoading && (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(apps ?? []).map((app) => {
          const chat = chatByApp.get(app.id);
          return (
            <div
              key={app.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-zinc-100">
                    {chat?.offer_title ?? "Application"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {chat?.company_name ? `${chat.company_name} · ` : ""}
                    {stageLabel(app.status)}
                    {chat?.peer ? ` · Recruiter: ${chat.peer.full_name}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                  {stageLabel(app.status)}
                </span>
              </div>

              <div className="mt-3">
                {app.chat_enabled || chat ? (
                  <Link
                    href={`/chat/recruitment/${app.id}`}
                    className="inline-flex items-center rounded-full bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                  >
                    Chat with Recruiter
                  </Link>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Status: {stageLabel(app.status)} — chat available after your application
                    progresses to the next stage.
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && (apps ?? []).length === 0 && (
          <p className="text-sm text-zinc-500">
            No applications yet. <Link href="/dashboard/recommendations" className="text-violet-400">Browse recommendations</Link> to apply.
          </p>
        )}
      </div>
    </main>
  );
}
