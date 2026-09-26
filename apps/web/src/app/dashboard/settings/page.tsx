"use client";

import axios from "axios";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TwoFactorSecurity } from "@/components/security/two-factor-security";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changeAccountPassword,
  confirmEmailChange,
  getMe,
  getTwoFactorStatus,
  requestEmailChange,
  updateAccountName,
} from "@/lib/api";
import { saveToken } from "@/lib/auth";

function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (!error.response) return "Cannot reach the server. Try again.";
  }
  return "Something went wrong. Please try again.";
}

export default function CandidateSettingsPage() {
  const queryClient = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const twoFactorQ = useQuery({ queryKey: ["two-factor-status"], queryFn: getTwoFactorStatus });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [email2fa, setEmail2fa] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password2fa, setPassword2fa] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const twoFactorEnabled = Boolean(twoFactorQ.data?.is_2fa_enabled);

  const clearMessage = () => { setNotice(null); setError(null); };

  async function saveName(event: React.FormEvent) {
    event.preventDefault(); clearMessage();
    const value = (name || meQ.data?.full_name || "").trim();
    if (value.length < 2) { setError("Name must contain at least two characters."); return; }
    setBusy("name");
    try { const user = await updateAccountName(value); queryClient.setQueryData(["me"], user); setName(""); setNotice("Your name was updated."); }
    catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }

  async function startEmailChange(event: React.FormEvent) {
    event.preventDefault(); clearMessage(); setBusy("email");
    try {
      const result = await requestEmailChange({ new_email: email, current_password: emailPassword, two_factor_code: email2fa || undefined });
      setPendingEmail(result.email); setNotice("A verification code was sent to your new email address.");
    } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }

  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault(); clearMessage();
    if (!/^\d{6}$/.test(emailOtp)) { setError("Enter the six-digit verification code."); return; }
    setBusy("verify-email");
    try {
      const result = await confirmEmailChange(emailOtp); saveToken(result.token); queryClient.setQueryData(["me"], result.user);
      setPendingEmail(null); setEmail(""); setEmailPassword(""); setEmail2fa(""); setEmailOtp(""); setNotice("Your email address was updated.");
    } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault(); clearMessage();
    if (newPassword.length < 8) { setError("New password must contain at least eight characters."); return; }
    if (newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
    setBusy("password");
    try {
      await changeAccountPassword({ current_password: currentPassword, new_password: newPassword, two_factor_code: password2fa || undefined });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPassword2fa(""); setNotice("Your password was changed.");
    } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  }

  return (
    <PageContainer>
      <PageHeader title="Account settings" description="Manage your personal details, sign-in email, password, and two-factor authentication." />
      <div className="mx-auto max-w-3xl space-y-6">
        {error ? <p role="alert" className="rounded-lg bg-danger-background p-3 text-sm font-medium text-danger">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg bg-success-background p-3 text-sm font-medium text-success">{notice}</p> : null}

        <form onSubmit={saveName} className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
          <div><h2 className="font-semibold text-foreground">Personal information</h2><p className="text-sm text-muted-foreground">Update the name displayed across CODITENT.</p></div>
          <Input label="Full name" value={name} placeholder={meQ.data?.full_name || "Your full name"} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit" loading={busy === "name"}>Save name</Button>
        </form>

        <form onSubmit={pendingEmail ? verifyEmail : startEmailChange} className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
          <div><h2 className="font-semibold text-foreground">Email address</h2><p className="text-sm text-muted-foreground">Current email: {meQ.data?.email || "Loading…"}. A new address must be verified before it replaces this one.</p></div>
          {pendingEmail ? <>
            <p className="text-sm text-foreground">Enter the code sent to <strong>{pendingEmail}</strong>.</p>
            <Input label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
            <div className="flex gap-2"><Button type="submit" loading={busy === "verify-email"}>Verify new email</Button><Button type="button" variant="ghost" onClick={() => { setPendingEmail(null); setEmailOtp(""); clearMessage(); }}>Cancel</Button></div>
          </> : <>
            <Input label="New email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Current password" type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required />
            {twoFactorEnabled ? <Input label="Authenticator or recovery code" autoComplete="one-time-code" value={email2fa} onChange={(e) => setEmail2fa(e.target.value.slice(0, 20))} required /> : null}
            <Button type="submit" loading={busy === "email"}>Send verification code</Button>
          </>}
        </form>

        <form onSubmit={savePassword} className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
          <div><h2 className="font-semibold text-foreground">Password</h2><p className="text-sm text-muted-foreground">Choose a new password with at least eight characters.</p></div>
          <Input label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /><Input label="Confirm new password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
          {twoFactorEnabled ? <Input label="Authenticator or recovery code" autoComplete="one-time-code" value={password2fa} onChange={(e) => setPassword2fa(e.target.value.slice(0, 20))} required /> : null}
          <Button type="submit" loading={busy === "password"}>Change password</Button>
        </form>

        <TwoFactorSecurity />
      </div>
    </PageContainer>
  );
}
