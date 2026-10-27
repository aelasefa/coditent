"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import axios from "axios";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminLogin, verifyTwoFactor } from "@/lib/api";
import { saveToken, saveTrustedDevice } from "@/lib/auth";
import { safeAdminNextDestination } from "@/lib/auth-redirect";

function AdminLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  function finishLogin(data: import("@/lib/types").TokenResponse) {
    if (data.trusted_device_token) saveTrustedDevice(data.trusted_device_token);
    if (data.user.role !== "PLATFORM_ADMIN") {
      setErrorMessage("Invalid admin credentials."); return;
    }
    saveToken(data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    const nextPath = safeAdminNextDestination(searchParams.get("next"));
    router.push(nextPath ?? "/admin");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const data = await adminLogin({ email, password });
      if ("require_2fa" in data) { setMfaToken(data.mfa_token); setMfaCode(""); return; }
      finishLogin(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setErrorMessage("Invalid admin credentials.");
      } else if (axios.isAxiosError(error) && error.response?.status === 403) {
        setErrorMessage("Administrator MFA must be enrolled before sign-in.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaToken || isSubmitting) return;
    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code) && !/^[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}$/.test(code)) { setErrorMessage("Enter a valid authenticator or recovery code."); return; }
    setIsSubmitting(true); setErrorMessage(null);
    try { finishLogin(await verifyTwoFactor(mfaToken, code)); }
    catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) { setMfaToken(null); setPassword(""); setMfaCode(""); setErrorMessage("Your verification session expired. Please sign in again."); }
      else if (axios.isAxiosError(error) && error.response?.status === 400) setErrorMessage("Invalid authenticator or recovery code.");
      else setErrorMessage("Something went wrong. Please try again.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <AuthLayout title="Admin login" subtitle="Use your platform administrator credentials to continue.">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-primary">Admin portal</p>
          {mfaToken ? <form className="space-y-5" onSubmit={handleMfaSubmit}>
            <p className="text-sm text-muted-foreground">Enter your authenticator code or an unused recovery code.</p>
            <Input label="Authenticator or recovery code" autoFocus autoComplete="one-time-code" disabled={isSubmitting} id="admin-mfa-code" maxLength={20} value={mfaCode} onChange={(event) => { setMfaCode(event.target.value); setErrorMessage(null); }} />
            <Button className="w-full" loading={isSubmitting} type="submit">Verify and continue</Button>
            <Button className="w-full" disabled={isSubmitting} type="button" variant="ghost" onClick={() => { setMfaToken(null); setMfaCode(""); setErrorMessage(null); }}>Back to sign in</Button>
            {errorMessage ? <p className="text-sm text-danger" role="alert">{errorMessage}</p> : null}
          </form> : <form className="space-y-5" onSubmit={handleSubmit}>
              <Input
                label="Admin email"
                autoComplete="email"
                disabled={isSubmitting}
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
              />
              <Input
                label="Password"
                autoComplete="current-password"
                disabled={isSubmitting}
                id="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage(null);
                }}
              />
            <Button className="w-full" loading={isSubmitting} type="submit">Sign in as admin</Button>

            {errorMessage ? (
              <p className="text-sm text-danger" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </form>}
    </AuthLayout>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageInner />
    </Suspense>
  );
}
