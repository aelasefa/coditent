"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { getMe, getCompanyMembers, api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { TeamMember } from "@/lib/types";
import {
  FiShield,
  FiSearch,
  FiTrash2,
  FiAlertCircle,
  FiCheckCircle,
  FiUserPlus,
} from "react-icons/fi";
import Link from "next/link";

export default function TeamPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const companyId = me?.company_id;
  const canChangeRoles = can(me ?? null, "change_employee_roles");
  const canRemoveEmployees = can(me ?? null, "remove_employees");

  const { data: membersData, isLoading, isError } = useQuery({
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
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const roleMut = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await api.patch(`/companies/${companyId}/members/${id}`, { company_role: role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", companyId] });
      setStatusMessage({ text: "Member role updated successfully." });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({
        text: e?.response?.data?.detail || "Failed to update member role",
        isError: true,
      });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/companies/${companyId}/members/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", companyId] });
      setRemoveTarget(null);
      setStatusMessage({ text: "Team member removed from company workspace." });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({
        text: e?.response?.data?.detail || "Failed to remove member",
        isError: true,
      });
    },
  });

  const members = membersData ?? [];

  const filteredMembers = useMemo(() => {
    let list = members;
    if (roleFilter !== "all") {
      list = list.filter((m) => m.company_role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.full_name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.company_role?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [members, roleFilter, search]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Team & Access Control"
          subtitle="Manage authorized colleagues, assign role permissions, and supervise recruiting access."
          badge={
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {members.length} Members
            </span>
          }
          actions={
            <Link
              href="/company/invitations"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              <FiUserPlus className="h-4 w-4" />
              <span>Invite Member</span>
            </Link>
          }
        />

        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium border ${
              statusMessage.isError
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            {statusMessage.isError ? (
              <FiAlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <FiCheckCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-[#121215] p-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, role…"
              className="h-8 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 pl-8 pr-3 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 text-xs text-zinc-700 dark:text-zinc-200 focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="HR">HR</option>
              <option value="RECRUITER">Recruiter</option>
              <option value="HIRING_MANAGER">Hiring Manager</option>
            </select>
          </div>
        </div>

        {/* Team Members Table */}
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : isError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-6 text-center text-xs text-rose-700 dark:text-rose-300">
            Failed to load team members.
          </div>
        ) : filteredMembers.length === 0 ? (
          <EmptyState
            icon={FiShield}
            title={members.length === 0 ? "No team members found" : "No members match search"}
            description={
              members.length === 0
                ? "Invite colleagues from the Invitations tab to build your recruitment team."
                : "Try clearing your search query or role filter."
            }
          />
        ) : (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="px-6 py-3">Team Member</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Company Role</th>
                    <th className="px-6 py-3 text-right">Management</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredMembers.map((member) => {
                    const isSelf = member.id === me?.id;
                    const isOwner = member.company_role === "OWNER";
                    return (
                      <tr key={member.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-850 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">
                              {member.full_name ? member.full_name[0].toUpperCase() : "U"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {member.full_name}
                                </span>
                                {isSelf && (
                                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.2 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                                    You
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 font-medium">
                          {member.email}
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge status={member.company_role} size="sm" showDot={false} />
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canChangeRoles && !isOwner && (
                              <select
                                defaultValue={member.company_role}
                                onChange={(e) =>
                                  roleMut.mutate({ id: member.id, role: e.target.value })
                                }
                                className="h-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-xs text-zinc-700 dark:text-zinc-200 focus:border-zinc-900 focus:outline-none"
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="HR">HR</option>
                                <option value="RECRUITER">RECRUITER</option>
                                <option value="HIRING_MANAGER">HIRING_MANAGER</option>
                              </select>
                            )}

                            {canRemoveEmployees && !isOwner && !isSelf && (
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(member)}
                                className="rounded-md border border-zinc-200 dark:border-zinc-700 p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 transition-colors"
                                title="Remove team member"
                              >
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {(isOwner || (!canChangeRoles && !canRemoveEmployees)) && (
                              <span className="text-zinc-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={!!removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => removeTarget && removeMut.mutate(removeTarget.id)}
          title="Remove Team Member"
          message={`Are you sure you want to remove ${removeTarget?.full_name} (${removeTarget?.email}) from this company workspace? Their recruitment access will be immediately revoked.`}
          confirmLabel="Remove Member"
          isLoading={removeMut.isPending}
          isDestructive={true}
        />
      </div>
    </AppShell>
  );
}
