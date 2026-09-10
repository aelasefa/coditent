"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getMe, getCompanyMembers, api } from "@/lib/api";
import { can } from "@/lib/permissions";
import type { CompanyRole, TeamMember } from "@/lib/types";
import { FiSearch, FiShield, FiUserPlus } from "react-icons/fi";

function roleLabel(role: string): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "HR":
      return "HR";
    case "RECRUITER":
      return "Recruiter";
    case "HIRING_MANAGER":
      return "Hiring Manager";
    default:
      return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// Descriptions derived from permissions.ts matrix. Backend remains authority.
const ROLE_CAPABILITIES: Record<string, string[]> = {
  OWNER: ["Full company management", "Team roles and removal", "All hiring workflows", "Subscription"],
  ADMIN: ["Company profile and settings", "Team roles and removal", "All hiring workflows"],
  HR: ["Publish and edit offers", "Review and advance candidates", "Assessments and analytics"],
  RECRUITER: ["Publish and edit offers", "Review and advance candidates", "Assessments and analytics"],
  HIRING_MANAGER: ["Edit offers", "Review and evaluate candidates", "Assessments and analytics"],
};

const ASSIGNABLE_ROLES: CompanyRole[] = ["ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"];

export default function TeamPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const companyId = me?.company_id;
  const canChangeRoles = can(me ?? null, "change_employee_roles");
  const canRemoveEmployees = can(me ?? null, "remove_employees");
  const canInvite = can(me ?? null, "invite_employees");

  const { data: membersData, isLoading, isError, refetch } = useQuery({
    queryKey: ["team", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return (await getCompanyMembers(companyId)) as TeamMember[];
    },
    enabled: !!companyId,
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const roleMut = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await api.patch(`/companies/${companyId}/members/${id}`, { company_role: role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", companyId] });
      toast("Role updated", { variant: "success" });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Role update failed";
      toast("Role update failed", { description: String(msg), variant: "error" });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/companies/${companyId}/members/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", companyId] });
      setRemoveTarget(null);
      toast("Member removed", { variant: "success" });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Remove failed";
      toast("Remove failed", { description: String(msg), variant: "error" });
    },
  });

  const members = membersData ?? [];
  const filtered = useMemo(() => {
    let list = members;
    if (roleFilter !== "all") list = list.filter((m) => m.company_role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.full_name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.company_role?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [members, roleFilter, search]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Team"
          subtitle={`${members.length} member${members.length === 1 ? "" : "s"} in this company. Roles follow platform permission policy.`}
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{members.length} total</span>}
          actions={
            canInvite ? (
              <Link href="/company/invitations" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
                <FiUserPlus aria-hidden className="h-4 w-4" />
                <span>Invite member</span>
              </Link>
            ) : undefined
          }
        />

        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="team-search" className="sr-only">Search team</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="team-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role"
              className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All roles</option>
            <option value="OWNER">Owner</option>
            <option value="ADMIN">Admin</option>
            <option value="HR">HR</option>
            <option value="RECRUITER">Recruiter</option>
            <option value="HIRING_MANAGER">Hiring Manager</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load team.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiShield}
            title={members.length === 0 ? "No team members found" : "No members match search"}
            description={members.length === 0 ? "Invite colleagues to collaborate on hiring." : "Clear search or role filter."}
            primaryAction={canInvite && members.length <= 1 ? { label: "Invite teammates", href: "/company/invitations" } : undefined}
          />
        ) : (
          <ul className="space-y-2" aria-label="Team members">
            {filtered.map((m) => {
              const isSelf = m.id === me?.id;
              const isOwner = m.company_role === "OWNER";
              return (
                <li key={m.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={m.full_name || m.email} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold text-foreground">
                        {m.full_name}
                        {isSelf && <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">You</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <StatusBadge status={m.company_role} size="sm" showDot={false} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {roleLabel(m.company_role)}: {(ROLE_CAPABILITIES[m.company_role] ?? ["Hiring workspace access"]).join(" · ")}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {canChangeRoles && !isOwner && !isSelf && (
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        Role
                        <select
                          value={m.company_role}
                          onChange={(e) => roleMut.mutate({ id: m.id, role: e.target.value })}
                          disabled={roleMut.isPending}
                          aria-label={`Change role for ${m.full_name}`}
                          className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-foreground"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{roleLabel(r)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {canRemoveEmployees && !isOwner && !isSelf && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(m)}>
                        Remove
                      </Button>
                    )}
                    {(isOwner || isSelf || (!canChangeRoles && !canRemoveEmployees)) && (
                      <span className="text-xs text-muted-foreground">
                        {isOwner ? "Owner role protected." : isSelf ? "This is your account." : "Read-only for your role."}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ConfirmDialog
          isOpen={!!removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => removeTarget && removeMut.mutate(removeTarget.id)}
          title="Remove team member"
          message={`Remove ${removeTarget?.full_name} (${removeTarget?.email})? Hiring access ends immediately.`}
          confirmLabel="Remove member"
          isLoading={removeMut.isPending}
          isDestructive={true}
        />
      </div>
    </AppShell>
  );
}
