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
import { FiCheck, FiMail, FiSearch, FiShield, FiTrash2, FiUserPlus } from "react-icons/fi";

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
  OWNER: ["Full company management", "Team roles and removal", "All hiring workflows", "Subscription management"],
  ADMIN: ["Company profile and settings", "Team roles and removal", "All hiring workflows"],
  HR: ["Publish and edit offers", "Review and advance candidates", "Candidate insights and analytics"],
  RECRUITER: ["Publish and edit offers", "Review and advance candidates", "Candidate insights and analytics"],
  HIRING_MANAGER: ["Edit offers", "Review and evaluate candidates", "Candidate insights and analytics"],
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
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          tone="green"
          center
          eyebrow="Workspace access"
          title="Your hiring team, organized."
          subtitle={`${members.length} ${members.length === 1 ? "teammate" : "teammates"} with clear roles and access to the work that matters.`}
        />

        <div className="company-results-toolbar -my-2">
          <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">{members.length} total</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-3 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="team-search" className="sr-only">Search team</label>
            <FiSearch aria-hidden className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="team-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Search name, email, role"
              className="min-h-11 w-full rounded-lg border border-border bg-surface-secondary/60 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter team by role" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:min-w-44">
            <option value="all">All roles</option>
            <option value="OWNER">Owner</option>
            <option value="ADMIN">Admin</option>
            <option value="HR">HR</option>
            <option value="RECRUITER">Recruiter</option>
            <option value="HIRING_MANAGER">Hiring Manager</option>
          </select>
          {canInvite && (
            <Link
              href="/company/invitations"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <FiUserPlus aria-hidden className="h-4 w-4" />
              <span>Invite member</span>
            </Link>
          )}
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
          <ul className="grid gap-3 lg:grid-cols-2" aria-label="Team members">
            {filtered.map((m) => {
              const isSelf = m.id === me?.id;
              const isOwner = m.company_role === "OWNER";
              const capabilities = ROLE_CAPABILITIES[m.company_role] ?? ["Hiring workspace access"];
              const canEditMember = canChangeRoles && !isOwner && !isSelf;
              const canRemoveMember = canRemoveEmployees && !isOwner && !isSelf;
              const showAccountNotice = !isOwner && (isSelf || (!canChangeRoles && !canRemoveEmployees));
              const showMemberControls = canEditMember || canRemoveMember || showAccountNotice;
              return (
                <li key={m.id} className="flex min-h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm transition-[border-color,box-shadow] hover:border-border hover:shadow-md">
                  <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={m.full_name || m.email} size="lg" className="ring-2 ring-surface-secondary ring-offset-2 ring-offset-surface" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-foreground">{m.full_name || "Team member"}</p>
                        {isSelf && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">You</span>}
                      </div>
                      <a href={`mailto:${m.email}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                        <FiMail aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{m.email}</span>
                      </a>
                    </div>
                    <StatusBadge status={m.company_role} size="sm" showDot={false} />
                  </div>

                  <section className="mt-5 flex-1 rounded-xl border border-border-subtle bg-surface-secondary/35 p-3.5 sm:p-4" aria-label={`${roleLabel(m.company_role)} access and permissions`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <FiShield aria-hidden className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">Access and permissions</span>
                          <span className="block truncate text-[11px] font-medium text-muted-foreground">{roleLabel(m.company_role)} access level</span>
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground-secondary">
                        {capabilities.length} {capabilities.length === 1 ? "permission" : "permissions"}
                      </span>
                    </div>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`${roleLabel(m.company_role)} permissions`}>
                      {capabilities.map((capability) => (
                        <li key={capability} className="flex min-h-12 items-center gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-xs font-medium leading-5 text-foreground-secondary">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <FiCheck aria-hidden className="h-3 w-3" />
                          </span>
                          <span>{capability}</span>
                        </li>
                      ))}
                    </ul>
                    {isOwner ? (
                      <aside className="mt-3 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.07] px-3 py-3" aria-label="Owner role protection">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
                            <FiShield aria-hidden className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                            <p className="font-semibold text-foreground">Owner role protected</p>
                            <p>Ownership cannot be changed from the team page.</p>
                          </div>
                      </aside>
                    ) : null}
                  </section>
                  </div>

                  {showMemberControls ? (
                  <div className="flex min-h-16 flex-wrap items-center gap-2 border-t border-border-subtle bg-surface-secondary/45 px-4 py-3 sm:px-5">
                    {canEditMember && (
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span className="shrink-0">Role</span>
                        <select
                          value={m.company_role}
                          onChange={(e) => roleMut.mutate({ id: m.id, role: e.target.value })}
                          disabled={roleMut.isPending}
                          aria-label={`Change role for ${m.full_name}`}
                          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{roleLabel(r)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {canRemoveMember && (
                      <Button size="md" variant="ghost" onClick={() => setRemoveTarget(m)} className="text-danger hover:bg-danger-background hover:text-danger">
                        <FiTrash2 aria-hidden className="h-4 w-4" />
                        Remove
                      </Button>
                    )}
                    {showAccountNotice && (
                      <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-primary shadow-sm">
                          <FiShield aria-hidden className="h-4 w-4" />
                        </span>
                        <span>
                          <strong className="block font-semibold text-foreground">
                            {isSelf ? "Your account" : "Read-only access"}
                          </strong>
                          <span>{isSelf ? "Manage your own profile in settings." : "Your role cannot manage this member."}</span>
                        </span>
                      </div>
                    )}
                  </div>
                  ) : null}
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
