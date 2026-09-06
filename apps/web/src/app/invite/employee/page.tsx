"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { acceptEmployeeInvite } from "@/lib/api";
export const dynamic = "force-dynamic";

const errorMap: Record<string,string> = {
  "Invalid or used token": "This invitation is invalid or no longer available.",
  "Token expired": "This invitation has expired. Please ask your administrator to send a new invitation.",
  "Email already in use": "This email is already registered.",
};

function EmployeeInviteInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) return <main className="mx-auto max-w-md px-6 py-10"><p className="text-sm text-red-400">Missing invitation token.</p></main>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      await acceptEmployeeInvite({ token, password, full_name: fullName });
      setMsg("Accepted — redirecting to login...");
      setTimeout(()=> router.push("/login"), 1200);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed";
      setMsg(errorMap[detail] || detail);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-semibold">Employee Invitation</h1>
      <p className="text-sm text-zinc-500">Company and role are set by the invitation — you cannot choose them.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Full name" required className="w-full rounded bg-zinc-800 px-3 py-2 text-sm" />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password (min 8)" required minLength={8} className="w-full rounded bg-zinc-800 px-3 py-2 text-sm" />
        <button disabled={loading} className="w-full rounded-full bg-violet-600 py-2 text-sm text-white disabled:opacity-50">{loading ? "Accepting..." : "Accept Invitation"}</button>
        {msg && <p className="text-xs text-violet-400">{msg}</p>}
      </form>
    </main>
  );
}
export default function EmployeeInvitePage(){ return <Suspense fallback={<main className="p-6 text-sm">Loading...</main>}><EmployeeInviteInner/></Suspense>; }
