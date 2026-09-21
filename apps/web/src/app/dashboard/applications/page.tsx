"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, listRecruitmentChats } from "@/lib/api";
import { ApplicationsWorkspace } from "@/components/candidate/applications-workspace";
import type { ApplicationItem } from "@/lib/types";

export default function CandidateApplicationsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground" role="status">Loading applications</p>}>
      <ApplicationsContent />
    </Suspense>
  );
}

function ApplicationsContent() {
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const { data } = await api.get<{ applications: ApplicationItem[] }>("/applications");
      return data.applications;
    },
  });
  const chatsQuery = useQuery({ queryKey: ["my-recruitment-chats"], queryFn: listRecruitmentChats });

  return (
    <ApplicationsWorkspace
      applications={appsQuery.data ?? []}
      chats={chatsQuery.data ?? []}
      loading={appsQuery.isLoading}
      error={appsQuery.isError}
      onRetry={() => { void appsQuery.refetch(); }}
    />
  );
}
