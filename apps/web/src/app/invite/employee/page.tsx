"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { validateEmployeeInvite, acceptEmployeeInvite, acceptEmployeeInviteExisting, getMe } from "@/lib/api";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

function EmployeeInviteInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";

  const [invite, setInvite] = useState<{ email: string; role: string; company_name: string; status: string; expires_at: string | null } | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [me, setMe] = useState<{ email?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      .catch((err: { response?: { data?: { detail?: string } } }) => {
        setInviteError(err?.response?.data?.detail || "Invalid invitation");
      })
      .finally(() => setLoadingInvite(false));

    getMe()
      .then((u) => setMe(u))
      .catch(() => setMe(null))
      .finally(() => setAuthChecked(true));
  }, [token]);

  if (!token) {
    return (
      <AuthLayout title="Invitation missing" subtitle="Check your email link and try again.">
        <p role="alert" className="text-sm font-medium text-danger">Missing invitation token.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Go to login</Link>
      </AuthLayout>
    );
  }

  if (loadingInvite || !authChecked) {
    return (
      <AuthLayout title="Checking invitation" subtitle="Validating your invite link.">
        <p role="status" className="text-sm text-muted-foreground">Loading invitation…</p>
      </AuthLayout>
    );
  }

  if (inviteError || !invite) {
    return (
      <AuthLayout title="Invitation unavailable" subtitle="This link cannot be used.">
        <p role="alert" className="text-sm text-muted-foreground">{inviteError || "This invitation is invalid."}</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Go to login</Link>
      </AuthLayout>
    );
  }

  const status = invite.status.toLowerCase();
  if (status === "expired") {
    return (
      <AuthLayout title="Invitation expired" subtitle={`For ${invite.email} as ${invite.role} at ${invite.company_name}.`}>
        <p className="text-sm text-muted-foreground">Expired {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : ""}. Ask your administrator to resend.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Login</Link>
      </AuthLayout>
    );
  }
  if (status === "revoked") {
    return (
      <AuthLayout title="Invitation revoked" subtitle={`Issued by ${invite.company_name}.`}>
        <p className="text-sm text-muted-foreground">This invitation was revoked. Contact your administrator for a new invite.</p>
      </AuthLayout>
    );
  }
  if (status === "accepted") {
    return (
      <AuthLayout title="Already accepted" subtitle="This invitation has already been used.">
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Go to login</Link>
      </AuthLayout>
    );
  }

  const isExistingUser = me && me.email?.toLowerCase() === invite.email.toLowerCase();
  const isLoggedInAsOther = me && me.email?.toLowerCase() !== invite.email.toLowerCase();

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
      setMsg(`Welcome to ${invite.company_name} as ${invite.role} — redirecting to login...`);
      setTimeout(() => router.push("/login"), 1400);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setMsg(e?.response?.data?.detail || "Failed to accept invitation");
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
      setMsg(`Welcome to ${invite.company_name} as ${res.role} — opening company portal...`);
      setTimeout(() => router.push("/company"), 1000);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setMsg(e?.response?.data?.detail || "Failed");
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title={`Join ${invite.company_name}`} subtitle={`Invited as ${invite.role}. Expires ${invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "in 72h"}.`}>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-secondary/60 p-3 text-[13px]">
        <div><dt className="text-muted-foreground">Email</dt><dd className="font-semibold">{invite.email}</dd></div>
        <div><dt className="text-muted-foreground">Role</dt><dd className="font-semibold">{invite.role}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Email and role come from invitation and cannot be changed.</p>

      {isLoggedInAsOther && (
        <p role="alert" className="mt-3 rounded-xl border border-warning/30 bg-warning-background p-3 text-[13px]">
          Logged in as <strong>{me?.email}</strong>, invite is for <strong>{invite.email}</strong>.{" "}
          <button type="button" onClick={() => { localStorage.removeItem("coditent_token"); location.reload(); }} className="font-semibold underline">
            Log out
          </button>{" "}
          and retry.
        </p>
      )}

      {isExistingUser ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-foreground-secondary">Account matches invite. Join {invite.company_name} as {invite.role} without a new account.</p>
          <Button onClick={handleExistingAccept} loading={submitting} className="w-full">
            Accept and join
          </Button>
        </div>
      ) : (
        <form onSubmit={handleNewUserSubmit} className="mt-4 space-y-3">
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required autoComplete="name" />
          <Input label="Email (from invitation)" value={invite.email} disabled />
          <div>
            <Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} className="mt-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>
          <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required autoComplete="new-password" />
          <Button type="submit" loading={submitting} disabled={Boolean(isLoggedInAsOther)} className="w-full">
            Create account and join
          </Button>
        </form>
      )}

      {msg && (
        <p role={isError ? "alert" : "status"} className={isError ? "mt-3 text-sm font-medium text-danger" : "mt-3 text-sm text-muted-foreground"}>
          {msg}
        </p>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/login" className="font-medium underline">Already have an account? Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export default function EmployeeInvitePage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm">Loading invitation...</main>}>
      <EmployeeInviteInner />
    </Suspense>
  );
}
