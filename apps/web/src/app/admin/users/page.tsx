"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getAdminUsers, impersonateUser } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import { FiSearch, FiUsers } from "react-icons/fi";

export default function AdminUsersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const usersQ = useQuery({ queryKey: ["admin", "users"], queryFn: getAdminUsers });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const impersonateMut = useMutation({
    mutationFn: impersonateUser,
    onSuccess: (data) => {
      saveToken(data.token);
      try {
        localStorage.setItem("user", JSON.stringify(data.user));
      } catch {
        /* storage optional */
      }
      if (data.user.role === "COMPANY_USER") {
        router.push("/company");
        return;
      }
      if (data.user.role === "RECRUITER") {
        router.push("/recruiter");
        return;
      }
      router.push("/dashboard");
    },
    onError: () => toast("Impersonation failed", { variant: "error" }),
  });

  const users = usersQ.data ?? [];
  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [users, search, roleFilter]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          subtitle={`${users.length} accounts. Impersonation is audited; use only for support.`}
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{filtered.length} shown</span>}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="users-search" className="sr-only">Search users</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="users-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3.5 pl-8 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All roles</option>
            <option value="CANDIDATE">Candidate</option>
            <option value="COMPANY_USER">Company user</option>
            <option value="RECRUITER">Recruiter (legacy)</option>
            <option value="PLATFORM_ADMIN">Platform admin</option>
            <option value="ADMIN">Admin (legacy)</option>
          </select>
        </div>

        {usersQ.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : usersQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load users.</p>
            <Button size="sm" variant="outline" onClick={() => usersQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FiUsers} title="No users match" description="Adjust search or role filter." />
        ) : (
          <ul className="space-y-2" aria-label="Users">
            {filtered.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4">
                <Avatar name={user.full_name || user.email} size="md" src={user.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{user.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <StatusBadge status={user.role} size="sm" showDot={false} />
                {user.role !== "PLATFORM_ADMIN" && user.role !== "ADMIN" && (
                  <Button size="sm" variant="outline" loading={impersonateMut.isPending} onClick={() => impersonateMut.mutate(user.id)}>
                    Sign in as user
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
