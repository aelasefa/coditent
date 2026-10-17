"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, listRecruitmentChats } from "@/lib/api";
import { ApplicationsWorkspace } from "@/components/candidate/applications-workspace";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ApplicationItem } from "@/lib/types";

export default function CandidateApplicationsPage() {
  return (
    <Suspense fallback={(
      <LoadingSpinner
        className="min-h-[calc(100dvh-90px)] max-[900px]:min-h-[calc(100dvh-76px)]"
        size="medium"
        placement="center"
        label="Loading applications"
      />
    )}>
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
