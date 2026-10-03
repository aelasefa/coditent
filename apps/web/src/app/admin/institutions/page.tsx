"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addInstitutionMember, createInstitution, listInstitutionMembers, listInstitutions, removeInstitutionMember, updateInstitutionLicense } from "@/lib/api";
import type { Institution } from "@/lib/types";


export default function AdminInstitutionsPage() {
  const queryClient = useQueryClient();
  const institutionsQ = useQuery({ queryKey: ["institutions"], queryFn: listInstitutions });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", domain: "", license_plan: "community", seat_limit: 100 });
  const [member, setMember] = useState({ email: "", role: "STUDENT" });
  const selected = institutionsQ.data?.find((item) => item.id === selectedId) ?? null;
  const membersQ = useQuery({ queryKey: ["institution-members", selectedId], queryFn: () => listInstitutionMembers(selectedId!), enabled: Boolean(selectedId) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["institutions"] }); if (selectedId) void queryClient.invalidateQueries({ queryKey: ["institution-members", selectedId] }); };
  const createMut = useMutation({ mutationFn: () => createInstitution({ ...form, domain: form.domain || null }), onSuccess: (created) => { setForm({ name: "", domain: "", license_plan: "community", seat_limit: 100 }); setSelectedId(created.id); refresh(); } });
  const licenseMut = useMutation({ mutationFn: (item: Institution) => updateInstitutionLicense(item.id, { status: item.status, license_plan: item.license_plan, seat_limit: item.seat_limit, license_expires_at: item.license_expires_at }), onSuccess: refresh });
  const memberMut = useMutation({ mutationFn: () => addInstitutionMember(selectedId!, member), onSuccess: () => { setMember({ email: "", role: "STUDENT" }); refresh(); } });
  const removeMut = useMutation({ mutationFn: (membershipId: string) => removeInstitutionMember(selectedId!, membershipId), onSuccess: refresh });

  return (
    <AdminShell>
      <div className="space-y-6 py-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Program access</p><h1 className="mt-2 text-3xl font-semibold">Institutions</h1><p className="mt-2 text-sm text-muted-foreground">Manage verified memberships and administrative license records. This screen does not charge or represent a signed contract.</p></div>
        <form className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 md:grid-cols-5" onSubmit={(event) => { event.preventDefault(); createMut.mutate(); }}>
          <Input label="Institution name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          <Input label="Email domain" value={form.domain} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))} placeholder="school.ma" />
          <label className="text-sm font-medium">Plan<select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" value={form.license_plan} onChange={(event) => setForm((current) => ({ ...current, license_plan: event.target.value }))}><option value="community">Community</option><option value="standard">Standard</option><option value="enterprise">Enterprise</option></select></label>
          <Input label="Seat limit" type="number" min={1} max={100000} value={form.seat_limit} onChange={(event) => setForm((current) => ({ ...current, seat_limit: Number(event.target.value) }))} required />
          <Button className="self-end" type="submit" loading={createMut.isPending}>Create institution</Button>
        </form>
        {createMut.isError ? <p role="alert" className="text-sm text-danger">Institution could not be created. Check that the name and domain are unique.</p> : null}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <section className="space-y-3">
            {(institutionsQ.data ?? []).map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-4 text-left ${selectedId === item.id ? "border-primary bg-primary/5" : "border-border-subtle bg-surface"}`}>
                <span className="flex justify-between gap-3"><strong>{item.name}</strong><span className="text-xs uppercase text-muted-foreground">{item.status}</span></span>
                <span className="mt-1 block text-sm text-muted-foreground">{item.license_plan} · {item.seats_used}/{item.seat_limit} seats</span>
              </button>
            ))}
            {!institutionsQ.isLoading && institutionsQ.data?.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No institutions configured.</p> : null}
          </section>
          <section className="rounded-xl border border-border-subtle bg-surface p-5">
            {!selected ? <p className="text-sm text-muted-foreground">Select an institution to manage its license and members.</p> : <InstitutionEditor key={selected.id} institution={selected} members={membersQ.data?.members ?? []} onSave={(value) => licenseMut.mutate(value)} saving={licenseMut.isPending} member={member} setMember={setMember} addMember={() => memberMut.mutate()} adding={memberMut.isPending} removeMember={(id) => removeMut.mutate(id)} />}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

function InstitutionEditor({ institution, members, onSave, saving, member, setMember, addMember, adding, removeMember }: { institution: Institution; members: Awaited<ReturnType<typeof listInstitutionMembers>>["members"]; onSave: (value: Institution) => void; saving: boolean; member: { email: string; role: string }; setMember: React.Dispatch<React.SetStateAction<{ email: string; role: string }>>; addMember: () => void; adding: boolean; removeMember: (id: string) => void }) {
  const [draft, setDraft] = useState(institution);
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold">{institution.name}</h2><p className="text-sm text-muted-foreground">{institution.domain || "No domain"}</p></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">Status<select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2" value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as Institution["status"] }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium">Plan<select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2" value={draft.license_plan} onChange={(event) => setDraft((value) => ({ ...value, license_plan: event.target.value as Institution["license_plan"] }))}><option value="community">Community</option><option value="standard">Standard</option><option value="enterprise">Enterprise</option></select></label><Input label="Seats" type="number" min={draft.seats_used} value={draft.seat_limit} onChange={(event) => setDraft((value) => ({ ...value, seat_limit: Number(event.target.value) }))} /></div><Button size="sm" loading={saving} onClick={() => onSave(draft)}>Save license</Button><div className="border-t border-border-subtle pt-4"><h3 className="font-semibold">Members</h3><form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); addMember(); }}><input type="email" required className="h-10 min-w-52 flex-1 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Existing account email" value={member.email} onChange={(event) => setMember((value) => ({ ...value, email: event.target.value }))} /><select className="h-10 rounded-lg border border-border bg-background px-3 text-sm" value={member.role} onChange={(event) => setMember((value) => ({ ...value, role: event.target.value }))}><option value="STUDENT">Student</option><option value="ADVISOR">Advisor</option><option value="ADMIN">Admin</option></select><Button type="submit" loading={adding}>Add</Button></form><div className="mt-3 divide-y divide-border-subtle">{members.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><strong className="block">{entry.full_name}</strong><span className="text-muted-foreground">{entry.email} · {entry.role} · {entry.status}</span></span>{entry.status === "active" ? <Button size="sm" variant="ghost" onClick={() => removeMember(entry.id)}>Remove</Button> : null}</div>)}</div></div></div>;
}
