"use client";

import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminActivity } from "@/lib/api";

export default function AdminActivityPage() {
  const activityQ = useQuery({ queryKey: ["admin", "activity"], queryFn: getAdminActivity });
  const logs = activityQ.data ?? [];

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader title="Platform Activity" description="Audited platform events, newest first." />
        {activityQ.isLoading ? (
          <div className="space-y-2" role="status" aria-label="Loading activity">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : activityQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load activity.</p>
            <Button size="sm" variant="outline" onClick={() => activityQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : logs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
            No platform events recorded yet.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Activity log">
            {logs.map((log) => (
              <li key={log.id} className="rounded-xl border border-border-subtle bg-surface px-4 py-3">
                <p className="text-sm font-medium text-foreground">{log.action.replace(/_/g, " ").toLowerCase()}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {log.admin_email}
                  {log.target_user_email ? ` → ${log.target_user_email}` : ""}
                  {log.details ? ` · ${log.details}` : ""} · {new Date(log.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
