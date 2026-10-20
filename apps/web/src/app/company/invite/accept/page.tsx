"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LegalLinks } from "@/components/legal/legal-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Logo } from "@/components/ui/logo";
import { acceptCompanyInvite, validateCompanyInvitation } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, passwordPolicyError, passwordRequirements } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

type State =
  | { kind: "loading" }
  | { kind: "valid"; email: string; company_name: string; contact_name: string | null; expires_at: string | null }
  | { kind: "invalid"; title: string; message: string };

function CompanyInviteLayout({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="company-theme min-h-screen bg-background text-foreground">
      <a href="#invite-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to invitation details
      </a>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
        <Link className="text-sm font-medium text-foreground-secondary transition-colors hover:text-primary" href="/login">Sign in</Link>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-8 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(28rem,1.08fr)] lg:gap-8 lg:pb-12">
        <section className="relative min-h-80 overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground sm:p-10 lg:min-h-[44rem] lg:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/15" />
          <div aria-hidden className="absolute right-16 top-20 h-16 w-16 rounded-full border border-white/10" />
          <div aria-hidden className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-white/5" />
          <div className="relative flex h-full flex-col justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">{eyebrow}</p>
            <div className="mt-20 lg:mt-auto">
              <h1 className="max-w-xl font-serif text-5xl font-normal leading-[0.98] tracking-[-0.05em] sm:text-6xl">{title}</h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/75">{subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-2 text-xs font-medium text-white/75">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Secure workspace</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Owner access</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Team ready</span>
              </div>
            </div>
          </div>
        </section>

        <section id="invite-content" className="flex items-center rounded-3xl border border-border-subtle bg-surface p-6 shadow-md sm:p-10 lg:p-12">
          <div className="w-full">{children}</div>
        </section>
      </div>
      <LegalLinks className="justify-center px-6 pb-6" />
    </main>
  );
}

function formatExpiry(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

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
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", title: "Invitation missing", message: "Open the complete link from your invitation email." });
      return;
    }
    validateCompanyInvitation(token)
      .then((inv) => {
        const status = inv.status.toLowerCase();
        if (status === "expired") setState({ kind: "invalid", title: "Invitation expired", message: "Ask your administrator to send you a new invitation." });
        else if (status === "revoked") setState({ kind: "invalid", title: "Invitation revoked", message: "Contact your administrator to request a new invitation." });
        else if (status === "accepted") setState({ kind: "invalid", title: "Already accepted", message: "This invitation has already been used. You can sign in to continue." });
        else if (status !== "pending") setState({ kind: "invalid", title: "Invitation unavailable", message: "This invitation cannot be used." });
        else setState({ kind: "valid", email: inv.email, company_name: inv.company_name, contact_name: inv.contact_name, expires_at: inv.expires_at });
      })
      .catch(() => setState({ kind: "invalid", title: "Invitation unavailable", message: "This link is invalid. Check the complete URL from your email." }));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setFormError("Enter your first and last name.");
      return;
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setFormError(policyError);
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
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "We could not accept this invitation. Please try again.";
      setFormError(String(message));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <CompanyInviteLayout eyebrow="Secure company invitation" title="Your workspace is almost ready." subtitle="We are validating your invitation before you create your owner account.">
        <div className="flex min-h-56 flex-col items-center justify-center text-center" aria-live="polite">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-secondary"><LoadingSpinner size="medium" label="Checking invitation" /></span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Checking your invitation</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">This should only take a moment.</p>
        </div>
      </CompanyInviteLayout>
    );
  }

  if (state.kind === "invalid") {
    return (
      <CompanyInviteLayout eyebrow="Secure company invitation" title="Let’s get you to the right place." subtitle="Invitation links are protected and can only be used once, before they expire.">
        <div className="mx-auto max-w-md text-center">
          <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-background text-2xl font-semibold text-danger">!</span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">{state.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{state.message}</p>
          <Link href="/login" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Go to sign in</Link>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">If you still need access, ask the person who invited you to send a fresh link.</p>
        </div>
      </CompanyInviteLayout>
    );
  }

  if (done) {
    return (
      <CompanyInviteLayout eyebrow="Welcome to Coditent" title={`You’re ready to lead ${state.company_name}.`} subtitle="Your secure owner account has been created successfully.">
        <div className="mx-auto max-w-md text-center" aria-live="polite">
          <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-background text-2xl font-semibold text-success">✓</span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Company account created</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Taking you to sign in, then you can finish setting up your company workspace.</p>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-primary"><LoadingSpinner size="small" label="Redirecting to sign in" />Redirecting…</div>
        </div>
      </CompanyInviteLayout>
    );
  }

  const allPasswordRequirementsMet = passwordRequirements.every((requirement) => requirement.test(password));
  return (
    <CompanyInviteLayout eyebrow="Company owner invitation" title={`Build ${state.company_name} with confidence.`} subtitle="Create your owner account to set up the workspace, invite your team, and start managing your hiring process.">
      <div className="mb-7">
        <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Owner access</span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Create your account</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.contact_name ? `${state.contact_name} invited you to create` : "You have been invited to create"} the company workspace.</p>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle sm:grid-cols-3">
        <div className="min-w-0 bg-surface-secondary/80 p-3.5"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</dt><dd className="mt-1 truncate text-sm font-semibold" title={state.company_name}>{state.company_name}</dd></div>
        <div className="min-w-0 bg-surface-secondary/80 p-3.5"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</dt><dd className="mt-1 truncate text-sm font-semibold" title={state.email}>{state.email}</dd></div>
        <div className="min-w-0 bg-surface-secondary/80 p-3.5"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valid until</dt><dd className="mt-1 truncate text-sm font-semibold">{formatExpiry(state.expires_at)}</dd></div>
      </dl>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Your first name" required autoComplete="given-name" />
          <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Your last name" required autoComplete="family-name" />
        </div>
        <div>
          <Input label="Create a password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter a strong password" required autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} aria-describedby="company-password-requirements" />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-pressed={showPassword} className="mt-2 rounded-sm text-[13px] font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{showPassword ? "Hide passwords" : "Show passwords"}</button>
          <ul id="company-password-requirements" className="mt-3 grid gap-1.5 rounded-xl bg-surface-secondary/70 p-3 text-xs sm:grid-cols-2" aria-label="Password requirements">
            {passwordRequirements.map((requirement) => {
              const isMet = requirement.test(password);
              return (
                <li key={requirement.label} className={`flex items-center gap-2 ${isMet ? "font-medium text-success" : "text-muted-foreground"}`}>
                  <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${isMet ? "bg-success text-white" : "border border-border-strong"}`}>{isMet ? "✓" : ""}</span>
                  {requirement.label}
                </li>
              );
            })}
          </ul>
        </div>
        <Input label="Confirm password" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" required autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} />

        {formError ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-3 text-sm font-medium text-danger">{formError}</p> : null}

        <Button type="submit" size="lg" loading={submitting} disabled={!firstName.trim() || !lastName.trim() || !allPasswordRequirementsMet || !confirm} className="w-full">Create owner account</Button>
      </form>

      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
        Your email and owner role are secured by this invitation. Already registered?{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4 hover:text-primary">Sign in</Link>
      </p>
    </CompanyInviteLayout>
  );
}

export default function CompanyInviteAcceptPage() {
  return (
    <Suspense fallback={<CompanyInviteLayout eyebrow="Secure company invitation" title="Your workspace is almost ready." subtitle="We are preparing your invitation."><div className="flex min-h-56 items-center justify-center"><LoadingSpinner size="medium" label="Loading invitation" /></div></CompanyInviteLayout>}>
      <AcceptInner />
    </Suspense>
  );
}
