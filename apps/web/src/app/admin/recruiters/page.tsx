"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-container";
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
    <AdminShell>
      <div className="py-2">
        <PageHeader title="Pending recruiter approvals" description="Review access requests before recruiters enter company workspaces." />

        {pendingQuery.isLoading ? <Card className="p-6">Loading pending recruiters…</Card> : null}

        <div className="mt-6 space-y-4">
          {pendingQuery.data?.map((user) => (
            <Card key={user.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{user.full_name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  onClick={() => approveMutation.mutate(user.id)}
                  size="sm"
                >
                  Approve
                </Button>
                <Button
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(user.id)}
                  size="sm"
                  variant="outline"
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}

          {pendingQuery.data && pendingQuery.data.length === 0 ? (
            <Card className="border-dashed p-8 text-center text-muted-foreground">No pending recruiters.</Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
