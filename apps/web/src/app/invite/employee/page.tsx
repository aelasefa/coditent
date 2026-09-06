"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { validateEmployeeInvite, acceptEmployeeInvite, acceptEmployeeInviteExisting, getMe } from "@/lib/api";
import CoditentLogo from "@/components/CoditentLogo";

export const dynamic = "force-dynamic";

function EmployeeInviteInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";

  const [invite, setInvite] = useState<{ email: string; role: string; company_name: string; status: string; expires_at: string | null } | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [me, setMe] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError("Missing invitation token.");
      setLoadingInvite(false);
      return;
    }
    validateEmployeeInvite(token)
      .then((data) => {
        setInvite(data);
        setInviteError(null);
      })
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Invalid invitation";
        setInviteError(detail);
      })
      .finally(() => setLoadingInvite(false));

    // Check auth for existing user flow
    getMe()
      .then((u) => setMe(u))
      .catch(() => setMe(null))
      .finally(() => setAuthChecked(true));
  }, [token]);

  if (!token) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] p-8 text-center">
          <p className="text-sm text-rose-600">Missing invitation token. Check your email link.</p>
          <Link href="/login" className="mt-4 inline-block text-sm text-zinc-600 underline">Go to login</Link>
        </div>
      </main>
    );
  }

  if (loadingInvite || !authChecked) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] p-8">
          <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mb-3" />
          <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      </main>
    );
  }

  if (inviteError || !invite) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-[#121215] p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950">✗</div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Invitation unavailable</h1>
          <p className="mt-1 text-sm text-zinc-500">{inviteError || "This invitation is invalid."}</p>
          <Link href="/login" className="mt-4 inline-block rounded-full bg-zinc-900 dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-zinc-900">Go to login</Link>
        </div>
      </main>
    );
  }

  const status = invite.status.toLowerCase();
  const isPending = status === "pending";
  const isExpired = status === "expired";
  const isRevoked = status === "revoked";
  const isAccepted = status === "accepted";

  const isExistingUser = me && me.email?.toLowerCase() === invite.email.toLowerCase();
  const isLoggedInAsOther = me && me.email?.toLowerCase() !== invite.email.toLowerCase();

  if (isExpired) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-[#121215] p-8 text-center">
          <h1 className="text-lg font-semibold">Invitation expired</h1>
          <p className="mt-1 text-sm text-zinc-500">This invitation for <strong>{invite.email}</strong> as <strong>{invite.role}</strong> at <strong>{invite.company_name}</strong> expired on {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "—"}. Ask your administrator to resend.</p>
          <Link href="/login" className="mt-4 inline-block rounded-full border border-zinc-200 px-5 py-2 text-sm">Login</Link>
        </div>
      </main>
    );
  }
  if (isRevoked) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] p-8 text-center">
          <h1 className="text-lg font-semibold">Invitation revoked</h1>
          <p className="mt-1 text-sm text-zinc-500">This invitation has been revoked by {invite.company_name}. Contact your administrator for a new invite.</p>
        </div>
      </main>
    );
  }
  if (isAccepted) {
    return (
      <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-[#121215] p-8 text-center">
          <h1 className="text-lg font-semibold text-emerald-700">Already accepted</h1>
          <p className="mt-1 text-sm text-zinc-500">This invitation has already been used.</p>
          <Link href="/login" className="mt-4 inline-block rounded-full bg-zinc-900 dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-zinc-900">Go to login</Link>
        </div>
      </main>
    );
  }

  // Pending — show acceptance
  const handleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setIsError(false);
    if (password.length < 8) {
      setMsg("Password must be at least 8 characters");
      setIsError(true);
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords do not match");
      setIsError(true);
      return;
    }
    if (fullName.trim().length < 2) {
      setMsg("Full name required");
      setIsError(true);
      return;
    }
    setSubmitting(true);
    try {
      await acceptEmployeeInvite({ token, password, full_name: fullName.trim() });
      setMsg(`Welcome to ${invite.company_name}! Your role: ${invite.role} — redirecting to login...`);
      setTimeout(() => router.push("/login"), 1400);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to accept invitation";
      setMsg(detail);
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExistingAccept = async () => {
    setMsg(null);
    setIsError(false);
    setSubmitting(true);
    try {
      const res = await acceptEmployeeInviteExisting({ token });
      setMsg(`Welcome to ${invite.company_name}! Your role: ${res.role} — redirecting to company portal...`);
      setTimeout(() => router.push("/company"), 1000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed";
      setMsg(detail);
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFAF9] dark:bg-[#09090B] px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <CoditentLogo size={32} useSvg={false} />
          <span className="text-sm font-bold tracking-tight">CODITENT</span>
          <span className="ml-auto text-xs text-zinc-500">Employee invitation</span>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] overflow-hidden shadow-sm">
          <div className="bg-zinc-900 dark:bg-zinc-800 px-6 py-5 text-white">
            <h1 className="text-lg font-semibold">You’ve been invited to join {invite.company_name}</h1>
            <p className="mt-1 text-sm text-zinc-300">Role: <strong className="text-white">{invite.role}</strong> · Expires {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "in 72h"}</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Invitation details</div>
              <div className="mt-2 space-y-1 text-sm">
                <div><span className="text-zinc-500">Company:</span> <strong>{invite.company_name}</strong></div>
                <div><span className="text-zinc-500">Email:</span> <strong>{invite.email}</strong> <span className="text-xs text-zinc-400">(cannot be changed)</span></div>
                <div><span className="text-zinc-500">Role:</span> <strong>{invite.role}</strong> <span className="text-xs text-zinc-400">(assigned by inviter)</span></div>
              </div>
            </div>

            {isLoggedInAsOther && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                You are logged in as <strong>{me.email}</strong>, but this invitation is for <strong>{invite.email}</strong>. <button onClick={() => { localStorage.removeItem("coditent_token"); location.reload(); }} className="underline font-medium">Log out</button> and try again, or open link in incognito.
              </div>
            )}

            {isExistingUser ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">You already have a CODITENT account matching this invitation. Click to join <strong>{invite.company_name}</strong> as <strong>{invite.role}</strong> without creating a new account.</p>
                <button onClick={handleExistingAccept} disabled={submitting} className="w-full rounded-full bg-zinc-900 dark:bg-white py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-50">
                  {submitting ? "Joining..." : `Accept & Join as ${invite.role}`}
                </button>
                <p className="text-xs text-zinc-400 text-center">Your existing account will be added to the company with the invited role.</p>
              </div>
            ) : (
              <form onSubmit={handleNewUserSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Full name *</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Email (from invitation)</label>
                  <input value={invite.email} disabled className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Password *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Confirm password *</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
                </div>
                <button disabled={submitting || isLoggedInAsOther} className="w-full rounded-full bg-zinc-900 dark:bg-white py-2.5 text-sm font-semibold text-white dark:text-zinc-900 disabled:opacity-50">
                  {submitting ? "Creating account..." : "Create account & Join company"}
                </button>
                <p className="text-xs text-zinc-400 text-center">Company and role are set by the invitation — you cannot change them.</p>
              </form>
            )}

            {msg && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
                {msg}
              </div>
            )}

            <div className="pt-2 text-center">
              <Link href="/login" className="text-xs text-zinc-500 underline">Already have an account? Sign in</Link>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">Invitation expires in 72h · Single-use · Role is server-enforced</p>
      </div>
    </main>
  );
}

export default function EmployeeInvitePage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm">Loading invitation...</main>}>
      <EmployeeInviteInner />
    </Suspense>
  );
}
