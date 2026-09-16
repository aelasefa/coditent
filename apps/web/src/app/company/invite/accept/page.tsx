"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptCompanyInvite, validateCompanyInvitation } from "@/lib/api";

export const dynamic = "force-dynamic";

type State =
  | { kind: "loading" }
  | { kind: "valid"; email: string; company_name: string; contact_name: string | null; expires_at: string | null }
  | { kind: "invalid"; title: string; message: string };

function AcceptInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", title: "Invitation missing", message: "Open the link from your invitation email." });
      return;
    }
    validateCompanyInvitation(token)
      .then((inv) => {
        const s = inv.status.toLowerCase();
        if (s === "expired") {
          setState({ kind: "invalid", title: "Invitation expired", message: "Ask your administrator for a new invitation." });
        } else if (s === "revoked") {
          setState({ kind: "invalid", title: "Invitation revoked", message: "Contact your administrator for a new invitation." });
        } else if (s === "accepted") {
          setState({ kind: "invalid", title: "Already accepted", message: "This invitation has already been used. Sign in instead." });
        } else if (s !== "pending") {
          setState({ kind: "invalid", title: "Invitation unavailable", message: "This invitation cannot be used." });
        } else {
          setState({ kind: "valid", email: inv.email, company_name: inv.company_name, contact_name: inv.contact_name, expires_at: inv.expires_at });
        }
      })
      .catch(() => {
        setState({ kind: "invalid", title: "Invitation unavailable", message: "This link is invalid. Check the full URL from your email." });
      });
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setFormError("First and last name are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptCompanyInvite({ token, password, full_name: `${firstName.trim()} ${lastName.trim()}` });
      setDone(true);
      setTimeout(() => router.push("/login?next=/company/onboarding"), 1200);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Acceptance failed.";
      setFormError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <AuthLayout title="Checking invitation" subtitle="Validating your secure link.">
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      </AuthLayout>
    );
  }

  if (state.kind === "invalid") {
    return (
      <AuthLayout title={state.title} subtitle={state.message}>
        <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Go to login
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Company created" subtitle="Your OWNER account is ready. Continuing to onboarding…">
        <p role="status" className="text-sm text-muted-foreground">Redirecting…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="You've been invited to join CODITENT" subtitle={`Company: ${state.company_name}`}>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-secondary/60 p-3 text-[13px]">
        <div><dt className="text-muted-foreground">Email</dt><dd className="font-semibold">{state.email}</dd></div>
        <div><dt className="text-muted-foreground">Expires</dt><dd className="font-semibold">{state.expires_at ? new Date(state.expires_at).toLocaleDateString() : "—"}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Email is fixed by the invitation. You will become the company OWNER.</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" />
          <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" />
        </div>
        <div>
          <Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} className="mt-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
        <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" error={formError} />
        <Button type="submit" loading={submitting} className="w-full">
          Create company account
        </Button>
      </form>
      <p className="mt-3 text-center text-xs text-muted-foreground">Already have an account? <Link href="/login" className="font-medium underline">Sign in</Link></p>
    </AuthLayout>
  );
}

export default function CompanyInviteAcceptPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm">Loading invitation...</main>}>
      <AcceptInner />
    </Suspense>
  );
}
