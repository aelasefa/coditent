"use client";

import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
} from "@/lib/api";
import type { TwoFactorSetup } from "@/lib/types";

function apiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "The security service is unavailable. Check your connection and try again.";
    const detail = error.response.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

function normalizeTotp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function TwoFactorSecurity() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"status" | "setup" | "enable" | "disable" | null>("status");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getTwoFactorStatus()
      .then((result) => {
        if (!active) return;
        setEnabled(result.is_2fa_enabled);
        queryClient.setQueryData(["two-factor-status"], result);
      })
      .catch((err) => active && setError(apiError(err, "Could not load two-factor status.")))
      .finally(() => active && setBusy(null));
    return () => { active = false; };
  }, [queryClient]);

  useEffect(() => {
    if (setup) codeRef.current?.focus();
  }, [setup]);

  async function beginSetup() {
    setBusy("setup"); setError(null); setSuccess(null); setBackupCodes(null);
    try { setSetup(await setupTwoFactor()); }
    catch (err) { setError(apiError(err, "Could not start two-factor setup.")); }
    finally { setBusy(null); }
  }

  async function confirmSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your authenticator app."); return; }
    setBusy("enable"); setError(null);
    try {
      const result = await enableTwoFactor(code);
      setEnabled(true); setSetup(null); setCode(""); setBackupCodes(result.backup_codes);
      queryClient.setQueryData(["two-factor-status"], { is_2fa_enabled: true });
      setSuccess("Two-factor authentication is enabled. Save the recovery codes below now.");
    } catch (err) { setError(apiError(err, "Could not enable two-factor authentication.")); }
    finally { setBusy(null); }
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    if (!password || disableCode.trim().length < 6) { setError("Enter your current password and authenticator or recovery code."); return; }
    setBusy("disable"); setError(null); setSuccess(null);
    try {
      await disableTwoFactor(password, disableCode.trim());
      setEnabled(false); setPassword(""); setDisableCode(""); setSetup(null); setBackupCodes(null);
      queryClient.setQueryData(["two-factor-status"], { is_2fa_enabled: false });
      setSuccess("Two-factor authentication has been disabled.");
    } catch (err) { setError(apiError(err, "Could not disable two-factor authentication.")); }
    finally { setBusy(null); }
  }

  return (
    <section aria-labelledby="two-factor-heading" className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
      <div>
        <h3 id="two-factor-heading" className="text-base font-semibold text-foreground">Two-factor authentication</h3>
        <p className="mt-1 text-sm text-muted-foreground">Protect your account with an authenticator app. After verification, this browser is trusted for 30 days; new browsers still require a code.</p>
      </div>
      {busy === "status" ? <p role="status" className="text-sm text-muted-foreground">Loading security status…</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-background p-3 text-sm font-medium text-danger">{error}</p> : null}
      {success ? <p role="status" className="rounded-lg bg-success-background p-3 text-sm font-medium text-success">{success}</p> : null}

      {backupCodes ? (
        <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-foreground">Save these recovery codes now</p>
          <p className="text-xs text-muted-foreground">Each code can be used once. They will not be shown again.</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Recovery codes">
            {backupCodes.map((item) => <li key={item} className="rounded bg-surface-secondary px-3 py-2">{item}</li>)}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={() => setBackupCodes(null)}>I saved these codes</Button>
        </div>
      ) : null}

      {enabled === false && !setup && !backupCodes ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Status: <strong className="text-foreground">Disabled</strong></p>
          <Button type="button" onClick={beginSetup} loading={busy === "setup"}>Set up 2FA</Button>
        </div>
      ) : null}

      {enabled === false && setup ? (
        <form className="space-y-4" onSubmit={confirmSetup}>
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
            {/* Backend returns a trusted, locally generated PNG data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr_code} alt="Authenticator setup QR code" className="h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <div className="space-y-2 text-sm">
              <p className="text-foreground">Scan this QR code with your authenticator app.</p>
              <p className="text-muted-foreground">Cannot scan it? Enter this secret manually:</p>
              <code className="block break-all rounded bg-surface-secondary p-2 font-mono text-foreground">{setup.secret}</code>
            </div>
          </div>
          <Input ref={codeRef} label="Six-digit authenticator code" value={code} onChange={(e) => { setCode(normalizeTotp(e.target.value)); setError(null); }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          <div className="flex gap-2"><Button type="submit" loading={busy === "enable"}>Verify and enable</Button><Button type="button" variant="ghost" onClick={() => { setSetup(null); setCode(""); setError(null); }}>Cancel</Button></div>
        </form>
      ) : null}

      {enabled === true && !backupCodes ? (
        <form className="space-y-4" onSubmit={disable}>
          <p className="text-sm text-muted-foreground">Status: <strong className="text-success">Enabled</strong></p>
          <p className="text-sm text-foreground">To disable 2FA, confirm your password and enter a current authenticator code or unused recovery code.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Current password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} required />
            <Input label="Authenticator or recovery code" autoComplete="one-time-code" value={disableCode} onChange={(e) => { setDisableCode(e.target.value.slice(0, 20)); setError(null); }} helper="Six digits or a recovery code such as AB12-CD34" required />
          </div>
          <Button type="submit" variant="danger" loading={busy === "disable"}>Disable 2FA</Button>
        </form>
      ) : null}
    </section>
  );
}
