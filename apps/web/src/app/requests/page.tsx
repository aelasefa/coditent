"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createRequest, getCompanies, getCompanyRecruiters, getMe, getRequests, updateRequestStatus } from "@/lib/api";
import Link from "next/link";

function RequestsInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const preselected = params.get("company") || "";
  const { data: requests } = useQuery({ queryKey: ["requests"], queryFn: getRequests });
  const { data: companies } = useQuery({ queryKey: ["companies"], queryFn: getCompanies });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [companyId, setCompanyId] = useState(preselected);
  const [recruiterId, setRecruiterId] = useState("");
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { data: recruiters } = useQuery({
    queryKey: ["company-recruiters", companyId],
    queryFn: () => getCompanyRecruiters(companyId),
    enabled: !!companyId,
  });

  const pendingForCompany = requests?.some((r) => r.company_id === companyId && r.status === "pending");

  const createMut = useMutation({
    mutationFn: () => createRequest({ company_id: companyId, recruiter_id: recruiterId || undefined, message: message || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requests"] }); setMsg("Request sent"); setMessage(""); setRecruiterId(""); },
    onError: (e: any) => setMsg(e?.response?.data?.detail || "Failed (candidates only)"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" }) => updateRequestStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Requests</h1>
      <p className="text-sm text-zinc-500">Candidates send requests to companies (optionally a recruiter). Recruiters accept/reject, then chat.</p>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">New request (candidates)</h2>
        <select value={companyId} onChange={e=>{setCompanyId(e.target.value); setRecruiterId(""); setMsg(null);}} className="mt-2 w-full rounded bg-zinc-800 px-3 py-2 text-sm">
          <option value="">Select company</option>
          {companies?.map(c=> <option key={c.id} value={c.id}>{c.name}{c.region ? ` — ${c.region}` : ""}</option>)}
        </select>
        {companyId && (
          <select value={recruiterId} onChange={e=>setRecruiterId(e.target.value)} className="mt-2 w-full rounded bg-zinc-800 px-3 py-2 text-sm">
            <option value="">Any recruiter (optional)</option>
            {recruiters?.map(r=> <option key={r.id} value={r.id}>{r.full_name} — {r.company_role}</option>)}
          </select>
        )}
        <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message (optional)" className="mt-2 w-full rounded bg-zinc-800 px-3 py-2 text-sm" rows={2} />
        {pendingForCompany && <p className="mt-2 text-xs text-yellow-500">You already have a pending request to this company</p>}
        <button
          onClick={()=> { if(!companyId) setMsg("Select company"); else if(pendingForCompany) setMsg("You already have a pending request to this company"); else createMut.mutate(); }}
          disabled={createMut.isPending || !!pendingForCompany}
          className="mt-2 rounded-full bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        > {createMut.isPending ? "Sending..." : "Send request"}</button>
        {msg && <p className={`mt-2 text-xs ${msg.includes("already") || msg.includes("Failed") || msg.includes("Select") ? "text-red-400" : "text-violet-400"}`}>{msg}</p>}
      </div>

      <div className="mt-6 space-y-2">
        {requests?.map(r=>{
          const isRecruiter = me?.role === "RECRUITER" || me?.role === "ADMIN" || me?.role === "COMPANY_USER" || me?.role === "PLATFORM_ADMIN";
          const isCompanyMember = me?.role === "COMPANY_USER" && me?.company_id === r.company_id;
          const canAct = isRecruiter && (isCompanyMember || me?.role === "PLATFORM_ADMIN" || me?.role === "ADMIN" || me?.role === "RECRUITER");
          const otherId = me?.id === r.candidate_id ? (r.recruiter_id || r.company_id) : r.candidate_id;
          // chat partner: if candidate accepted, chat with recruiter; else generic
          const chatTarget = me?.role === "CANDIDATE" ? (r.recruiter_id || r.candidate_id) : r.candidate_id;
          return (
          <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-sm"><span className="font-medium">{r.candidate?.full_name || r.candidate_id.slice(0,8)}</span> → <span className="font-medium">{r.company?.name || r.company_id.slice(0,8)}</span> {r.recruiter ? `· recruiter ${r.recruiter.full_name}` : ""}</p>
            <p className="text-xs text-zinc-500">{r.message || "No message"} · <span className={r.status==="pending" ? "text-yellow-500" : r.status==="accepted" ? "text-green-500" : "text-red-500"}>{r.status}</span> · {new Date(r.created_at).toLocaleString()}</p>
            {r.status==="pending" && canAct && (
              <div className="mt-2 flex gap-2">
                <button onClick={()=>updateMut.mutate({id:r.id, status:"accepted"})} disabled={updateMut.isPending} className="rounded-full bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50">Accept</button>
                <button onClick={()=>updateMut.mutate({id:r.id, status:"rejected"})} disabled={updateMut.isPending} className="rounded-full border border-zinc-700 px-3 py-1 text-xs disabled:opacity-50">Reject</button>
              </div>
            )}
            {r.status==="pending" && !canAct && (
              <p className="mt-2 text-xs text-zinc-500">Waiting for recruiter response...</p>
            )}
            {r.status==="accepted" && (
              <Link href={`/chat/${r.recruiter_id && me?.role==="CANDIDATE" ? r.recruiter_id : r.candidate_id}`} className="mt-2 inline-block text-xs text-violet-400">Open chat →</Link>
            )}
          </div>
        )})}
        {requests?.length===0 && <p className="text-sm text-zinc-500">No requests.</p>}
      </div>
    </main>
  );
}

export default function RequestsPage() {
  return <Suspense fallback={null}><RequestsInner /></Suspense>;
}
