"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { getMe, inviteEmployee, listEmployeeInvitations, revokeEmployeeInvitation } from "@/lib/api";
import { can } from "@/lib/permissions";
import { EmployeeInvitation } from "@/lib/types";
import {
  FiMail,
  FiSend,
  FiShield,
  FiAlertCircle,
  FiCheckCircle,
  FiTrash2,
  FiInfo,
} from "react-icons/fi";

export default function CompanyInvitationsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const canInvite = can(me ?? null, "invite_employees");

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-invites"],
    queryFn: listEmployeeInvitations,
    enabled: canInvite,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECRUITER");
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<EmployeeInvitation | null>(null);

  const inviteMut = useMutation({
    mutationFn: () => {
      if (!email.trim() || !email.includes("@")) {
        throw new Error("Please provide a valid work email address");
      }
      return inviteEmployee({ email: email.trim(), role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-invites"] });
      setEmail("");
      setStatusMessage({ text: "Invitation sent successfully!" });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({
        text: e?.response?.data?.detail || e?.message || "Failed to send invitation",
        isError: true,
      });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeEmployeeInvitation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-invites"] });
      setRevokeTarget(null);
      setStatusMessage({ text: "Invitation revoked." });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({
        text: e?.response?.data?.detail || "Failed to revoke invitation",
        isError: true,
      });
    },
  });

  const invitations = data?.invitations ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Team Invitations"
          subtitle="Invite colleagues, recruiters, and hiring managers to collaborate in your company workspace."
          badge={
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {invitations.length} Active Invites
            </span>
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

        {canInvite ? (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Invite New Team Member</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  An email invitation link will be sent to join your company workspace.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                inviteMut.mutate();
              }}
              className="space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto]">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Work Email *
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Role & Permissions *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="RECRUITER">Recruiter (Publish jobs & ATS)</option>
                    <option value="HR">HR Specialist (ATS & Pipeline)</option>
                    <option value="HIRING_MANAGER">Hiring Manager (Review & Evaluate)</option>
                    <option value="ADMIN">Admin (Full Team & Settings)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={inviteMut.isPending}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors w-full sm:w-auto"
                  >
                    <FiSend className="h-3.5 w-3.5" />
                    <span>{inviteMut.isPending ? "Sending…" : "Send Invite"}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                <FiInfo className="h-3 w-3 shrink-0" />
                <span>
                  Invited members will receive an authorization token to register or connect to this company workspace.
                </span>
              </div>
            </form>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200/60 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/40 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2.5">
            <FiShield className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Restricted Access</p>
              <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                Only team members with <strong>OWNER</strong> or <strong>ADMIN</strong> roles are authorized to invite new employees.
              </p>
            </div>
          </div>
        )}

        {/* Invitations Table */}
        <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] shadow-xs overflow-hidden">
          <div className="border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Sent Invitations</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">History and status of member invitations</p>
          </div>

          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={4} cols={4} />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-rose-600 dark:text-rose-400">
              Only Owner/Admin can view invitations list.
            </div>
          ) : invitations.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={FiMail}
                title="No pending invitations"
                description="Your company workspace currently has no active or pending team member invitations."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="px-6 py-3">Invited Email</th>
                    <th className="px-6 py-3">Assigned Role</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Expires On</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {invitations.map((inv: EmployeeInvitation) => (
                    <tr key={inv.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-850 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">{inv.email}</td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={inv.role} size="sm" showDot={false} />
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={inv.status} size="sm" />
                      </td>
                      <td className="px-6 py-3.5 text-zinc-500 dark:text-zinc-400">
                        {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {inv.status === "PENDING" && canInvite ? (
                          <button
                            type="button"
                            onClick={() => setRevokeTarget(inv)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 transition-colors"
                          >
                            <FiTrash2 className="h-3.5 w-3.5" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ConfirmDialog
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}
          title="Revoke Invitation"
          message={`Are you sure you want to cancel the invitation sent to ${revokeTarget?.email}? The invitation link will immediately become invalid.`}
          confirmLabel="Revoke Invitation"
          isLoading={revokeMut.isPending}
          isDestructive={true}
        />
      </div>
    </AppShell>
  );
}
