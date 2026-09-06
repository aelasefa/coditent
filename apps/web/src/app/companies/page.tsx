"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCompanies, createCompany, joinCompany } from "@/lib/api";
import Link from "next/link";

export default function CompaniesPage() {
  const qc = useQueryClient();
  const { data: companies } = useQuery({ queryKey: ["companies"], queryFn: getCompanies });
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => createCompany({ name, region: region || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); setMsg("Company created & joined"); setName(""); setRegion(""); },
    onError: (e: any) => setMsg(e?.response?.data?.detail || "Failed"),
  });
  const joinMut = useMutation({
    mutationFn: (id: string) => joinCompany(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); setMsg("Joined company"); },
    onError: (e: any) => setMsg(e?.response?.data?.detail || "Failed"),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Companies</h1>
      <p className="text-sm text-zinc-500">Each company can have multiple recruiters. Create or join one.</p>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Create company (recruiters only)</h2>
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Company name" className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm" />
          <input value={region} onChange={e=>setRegion(e.target.value)} placeholder="Region" className="w-32 rounded bg-zinc-800 px-3 py-2 text-sm" />
          <button onClick={()=>createMut.mutate()} className="rounded-full bg-violet-600 px-4 py-2 text-sm text-white">Create</button>
        </div>
        {msg && <p className="mt-2 text-xs text-violet-400">{msg}</p>}
      </div>

      <div className="mt-6 grid gap-3">
        {companies?.map(c=>(
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-zinc-500">{c.region || "—"} · {c.recruiter_count} recruiter(s)</p>
              <p className="text-xs text-zinc-600">{c.description || ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>joinMut.mutate(c.id)} className="rounded-full border border-zinc-700 px-3 py-1 text-xs">Join</button>
              <Link href={`/requests?company=${c.id}`} className="rounded-full bg-violet-600 px-3 py-1 text-xs text-white">Request</Link>
            </div>
          </div>
        ))}
        {companies?.length===0 && <p className="text-sm text-zinc-500">No companies yet.</p>}
      </div>
    </main>
  );
}
