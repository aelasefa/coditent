"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { approveRecruiter, getPendingRecruiters, rejectRecruiter } from "@/lib/api";

export default function AdminRecruitersPage() {
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ["admin", "pending-recruiters"],
    queryFn: getPendingRecruiters,
  });

  const approveMutation = useMutation({
    mutationFn: approveRecruiter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pending-recruiters"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectRecruiter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pending-recruiters"] });
    },
  });

  return (
    <main className="min-h-screen bg-md-background pb-14">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Admin workspace</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight">Pending recruiter approvals</h1>
          </div>
          <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin">
            Back to dashboard
          </Link>
        </header>

        {pendingQuery.isLoading ? <MdCard className="mt-6 p-6">Loading pending recruiters...</MdCard> : null}

        <div className="mt-6 space-y-4">
          {pendingQuery.data?.map((user) => (
            <MdCard key={user.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{user.full_name}</p>
                <p className="text-sm text-md-onSurfaceVariant">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <MdButton
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  onClick={() => approveMutation.mutate(user.id)}
                  size="sm"
                  variant="filled"
                >
                  Approve
                </MdButton>
                <MdButton
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(user.id)}
                  size="sm"
                  variant="outlined"
                >
                  Reject
                </MdButton>
              </div>
            </MdCard>
          ))}

          {pendingQuery.data && pendingQuery.data.length === 0 ? (
            <MdCard className="p-6 text-md-onSurfaceVariant">No pending recruiters.</MdCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}
