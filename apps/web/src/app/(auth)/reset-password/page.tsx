"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { confirmPasswordRecovery } from "@/lib/api";
import { passwordPolicyError, passwordRequirements } from "@/lib/password-policy";
import styles from "../login/login-page.module.css";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const policyError = passwordPolicyError(password);
    if (!token) return setError("This recovery link is incomplete.");
    if (policyError) return setError(policyError);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true); setError(null);
    try {
      await confirmPasswordRecovery({ token, new_password: password });
      setComplete(true);
    } catch (failure) {
      const detail = (failure as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "The recovery link is invalid or expired.");
    } finally { setBusy(false); }
  }

  return (
    <main className={styles.page}><div className={styles.loginContent}>
      <header className={styles.header}><Link href="/" aria-label="Coditent home"><Logo size="md" /></Link></header>
      <div className={styles.shell}><section className={styles.formColumn} aria-labelledby="reset-title"><div className={styles.formInner}>
        <p className={styles.eyebrow}>Secure recovery</p><h1 id="reset-title" className={styles.title}>Choose a <em>new password.</em></h1>
        <p className={styles.subtitle}>Completing recovery invalidates every existing access session. Two-factor authentication remains enabled.</p>
        <div className={styles.formArea}>{complete ? (
          <div role="status" className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm">Password updated. <Link className="font-semibold text-primary underline" href="/login">Sign in again</Link>.</div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <Input label="New password" type="password" required autoComplete="new-password" maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} />
            <ul className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">{passwordRequirements.map((requirement) => <li key={requirement.label} className={requirement.test(password) ? "text-success" : ""}>{requirement.test(password) ? "✓" : "○"} {requirement.label}</li>)}</ul>
            <Input label="Confirm new password" type="password" required autoComplete="new-password" maxLength={128} value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(null); }} />
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <Button type="submit" loading={busy} className={styles.submitButton}>Reset password</Button>
          </form>
        )}</div>
      </div></section></div>
    </div></main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordForm /></Suspense>;
}
