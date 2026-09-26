"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import axios from "axios";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput } from "@/components/ui/md-field";
import { adminLogin, verifyTwoFactor } from "@/lib/api";
import { saveToken, saveTrustedDevice } from "@/lib/auth";

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
    if (data.user.role !== "ADMIN" && data.user.role !== "PLATFORM_ADMIN") {
      setErrorMessage("This account is not an admin."); return;
    }
    saveToken(data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    const nextParam = searchParams.get("next");
    const nextPath = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
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
    <main className="relative min-h-screen overflow-hidden bg-md-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <MdCard className="w-full rounded-md-2xl border-md-outline/20 bg-md-surface p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">Admin Portal</p>
            <h1 className="mt-2 text-3xl font-medium">Admin login</h1>
            <p className="mt-1 text-sm text-md-onSurfaceVariant">Use super admin credentials to continue.</p>
          </div>

          {mfaToken ? <form className="space-y-5" onSubmit={handleMfaSubmit}>
            <p className="text-sm text-md-onSurfaceVariant">Enter your authenticator code or an unused recovery code.</p>
            <MdField htmlFor="admin-mfa-code" label="Authenticator or recovery code">
              <MdInput autoFocus autoComplete="one-time-code" disabled={isSubmitting} id="admin-mfa-code" maxLength={20} value={mfaCode} onChange={(event) => { setMfaCode(event.target.value); setErrorMessage(null); }} />
            </MdField>
            <MdButton className="w-full" disabled={isSubmitting} type="submit" variant="filled">{isSubmitting ? "Verifying..." : "Verify and continue"}</MdButton>
            <MdButton className="w-full" disabled={isSubmitting} type="button" variant="ghost" onClick={() => { setMfaToken(null); setMfaCode(""); setErrorMessage(null); }}>Back to sign in</MdButton>
            {errorMessage ? <p className="text-sm text-[#EF4444]" role="alert">{errorMessage}</p> : null}
          </form> : <form className="space-y-5" onSubmit={handleSubmit}>
            <MdField htmlFor="email" label="Admin email">
              <MdInput
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
            </MdField>

            <MdField htmlFor="password" label="Password">
              <MdInput
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
            </MdField>

            <MdButton className="w-full" disabled={isSubmitting} type="submit" variant="filled">
              {isSubmitting ? "Signing in..." : "Sign in as Admin"}
            </MdButton>

            {errorMessage ? (
              <p className="text-sm text-[#EF4444]" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </form>}
        </MdCard>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageInner />
    </Suspense>
  );
}
