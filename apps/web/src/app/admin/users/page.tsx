"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/company/ConfirmDialog";
import { EmptyState } from "@/components/company/EmptyState";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Modal } from "@/components/company/Modal";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createAdminUser,
  deactivateAdminUser,
  getAdminUsers,
  impersonateUser,
  updateAdminUser,
} from "@/lib/api";
import { saveToken } from "@/lib/auth";
import { passwordPolicyError, passwordRequirements } from "@/lib/password-policy";
import type { User } from "@/lib/types";
import { FiEdit2, FiPlus, FiSearch, FiUsers } from "react-icons/fi";

type UserForm = { full_name: string; email: string; password: string };
const emptyForm: UserForm = { full_name: "", email: "", password: "" };

function apiMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const usersQ = useQuery({ queryKey: ["admin", "users"], queryFn: getAdminUsers });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editing, setEditing] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const createMut = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      void refresh();
      setCreateOpen(false);
      setForm(emptyForm);
      toast("Candidate account created", { variant: "success" });
    },
    onError: (error) => toast(apiMessage(error, "Account could not be created"), { variant: "error" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { full_name?: string; email?: string; is_active?: boolean } }) =>
      updateAdminUser(id, payload),
    onSuccess: () => {
      void refresh();
      setEditing(null);
      toast("Account updated", { variant: "success" });
    },
    onError: (error) => toast(apiMessage(error, "Account could not be updated"), { variant: "error" }),
  });
  const deactivateMut = useMutation({
    mutationFn: deactivateAdminUser,
    onSuccess: () => {
      void refresh();
      setDeactivateTarget(null);
      toast("Account deactivated and sessions invalidated", { variant: "success" });
    },
    onError: (error) => toast(apiMessage(error, "Account could not be deactivated"), { variant: "error" }),
  });
  const impersonateMut = useMutation({
    mutationFn: impersonateUser,
    onSuccess: (data) => {
      saveToken(data.token);
      try { localStorage.setItem("user", JSON.stringify(data.user)); } catch { /* storage optional */ }
      if (data.user.role === "COMPANY_USER") return router.push("/company");
      if (data.user.role === "RECRUITER") return router.push("/recruiter");
      router.push("/dashboard");
    },
    onError: (error) => toast(apiMessage(error, "Impersonation failed"), { variant: "error" }),
  });

  const users = usersQ.data ?? [];
  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== "all") list = list.filter((user) => user.role === roleFilter);
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((user) => user.full_name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
    }
    return list;
  }, [users, search, roleFilter]);

  const submitCreate = () => {
    const passwordError = passwordPolicyError(form.password);
    if (passwordError) {
      toast(passwordError, { variant: "error" });
      return;
    }
    createMut.mutate({ ...form, role: "CANDIDATE" });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          subtitle={`${users.length} accounts. Changes and impersonation are audited.`}
          badge={<Button size="sm" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}><FiPlus /> Create candidate</Button>}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="users-search" className="sr-only">Search users</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input id="users-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="h-9 w-full rounded-lg border border-border bg-surface px-3.5 pl-8 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Role filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All roles</option><option value="CANDIDATE">Candidate</option><option value="COMPANY_USER">Company user</option><option value="RECRUITER">Recruiter (legacy)</option><option value="PLATFORM_ADMIN">Platform admin</option><option value="ADMIN">Admin (legacy)</option>
          </select>
        </div>

        {usersQ.isLoading ? <TableSkeleton rows={6} cols={3} /> : usersQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center"><p className="text-sm font-semibold text-danger">Could not load users.</p><Button size="sm" variant="outline" onClick={() => usersQ.refetch()} className="mt-3">Retry</Button></div>
        ) : filtered.length === 0 ? <EmptyState icon={FiUsers} title="No users match" description="Adjust search or role filter." /> : (
          <ul className="space-y-2" aria-label="Users">
            {filtered.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4">
                <Avatar name={user.full_name || user.email} size="md" src={user.avatar_url} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{user.full_name}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span>
                <StatusBadge status={user.is_active === false ? "inactive" : "active"} size="sm" />
                <StatusBadge status={user.role} size="sm" showDot={false} />
                <Button size="sm" variant="outline" onClick={() => setEditing(user)} aria-label={`Edit ${user.full_name}`}><FiEdit2 /> Edit</Button>
                {user.is_active === false ? (
                  <Button size="sm" variant="outline" loading={updateMut.isPending} onClick={() => updateMut.mutate({ id: user.id, payload: { is_active: true } })}>Reactivate</Button>
                ) : user.role !== "PLATFORM_ADMIN" && user.role !== "ADMIN" ? (
                  <>
                    <Button size="sm" variant="outline" loading={impersonateMut.isPending} onClick={() => impersonateMut.mutate(user.id)}>Sign in as user</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeactivateTarget(user)}>Deactivate</Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create candidate account" subtitle="Company employees must continue to use an invitation." maxWidth="sm" footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={createMut.isPending} onClick={submitCreate}>Create account</Button></>}>
        <div className="space-y-3">
          <label className="block text-xs font-medium">Full name<input className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} maxLength={100} /></label>
          <label className="block text-xs font-medium">Email<input className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="block text-xs font-medium">Temporary password<input className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} maxLength={128} /></label>
          <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">{passwordRequirements.map((requirement) => <li key={requirement.label} className={requirement.test(form.password) ? "text-success" : ""}>{requirement.test(form.password) ? "✓" : "○"} {requirement.label}</li>)}</ul>
        </div>
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit account" maxWidth="sm" footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button loading={updateMut.isPending} onClick={() => editing && updateMut.mutate({ id: editing.id, payload: { full_name: editing.full_name, email: editing.email } })}>Save changes</Button></>}>
        {editing && <div className="space-y-3"><label className="block text-xs font-medium">Full name<input className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3" value={editing.full_name} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} maxLength={100} /></label><label className="block text-xs font-medium">Email<input className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label></div>}
      </Modal>

      <ConfirmDialog isOpen={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} onConfirm={() => deactivateTarget && deactivateMut.mutate(deactivateTarget.id)} title="Deactivate account?" message="The user will be signed out immediately. Their applications, messages, and audit history are retained." confirmLabel="Deactivate" isLoading={deactivateMut.isPending} />
    </AdminShell>
  );
}
