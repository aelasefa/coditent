"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { requestPasswordRecovery } from "@/lib/api";
import styles from "../login/login-page.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await requestPasswordRecovery(email.trim());
      setMessage(result.detail);
    } catch {
      setMessage("If an eligible account exists, a password recovery email has been queued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.loginContent}>
        <header className={styles.header}><Link href="/" aria-label="Coditent home"><Logo size="md" /></Link></header>
        <div className={styles.shell}><section className={styles.formColumn} aria-labelledby="recovery-title"><div className={styles.formInner}>
          <p className={styles.eyebrow}>Account recovery</p>
          <h1 id="recovery-title" className={styles.title}>Reset your <em>password.</em></h1>
          <p className={styles.subtitle}>Enter your account email. For privacy, the response is the same whether or not an eligible account exists.</p>
          <div className={styles.formArea}>
            {message ? <div role="status" className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">{message}<p className="mt-3"><Link className="font-semibold text-primary underline" href="/login">Return to sign in</Link></p></div> : (
              <form className={styles.form} onSubmit={submit}>
                <Input label="Email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
                <Button type="submit" loading={busy} className={styles.submitButton}>Send recovery link</Button>
                <p className={styles.registerPrompt}><Link href="/login">Back to sign in</Link></p>
              </form>
            )}
          </div>
        </div></section></div>
      </div>
    </main>
  );
}
