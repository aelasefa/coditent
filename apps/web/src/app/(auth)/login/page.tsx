"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Suspense, useState } from "react";
import { SocialLoginButtons } from "@/components/social-login-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { login, verifyTwoFactor } from "@/lib/api";
import { saveToken, saveTrustedDevice } from "@/lib/auth";
import { getPostAuthDestination } from "@/lib/candidate-onboarding";
import type { TokenResponse } from "@/lib/types";
import styles from "./login-page.module.css";

type LoginRole = "candidate" | "recruiter";

function safeNext(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeRole, setActiveRole] = useState<LoginRole>("candidate");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function finishLogin(data: TokenResponse) {
    if (data.trusted_device_token) saveTrustedDevice(data.trusted_device_token);
    const nextPath = safeNext(searchParams.get("next"));
    if (data.user.role === "PLATFORM_ADMIN" || data.user.role === "ADMIN") {
      saveToken(data.token); router.push(nextPath ?? "/admin"); return;
    }
    if (data.user.role === "COMPANY_USER") {
      saveToken(data.token); router.push(nextPath ?? "/company"); return;
    }
    const expectedRole = activeRole === "candidate" ? "CANDIDATE" : "RECRUITER";
    if (data.user.role !== expectedRole) {
      setErrorMessage(activeRole === "candidate"
        ? "This account is registered as a Recruiter. Use the Recruiter tab to sign in."
        : "This account is registered as a Candidate. Use the Candidate tab to sign in.");
      return;
    }
    saveToken(data.token);
    router.push(await getPostAuthDestination(queryClient, data.user, { next: nextPath }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const data = await login({ email, password });
      if ("require_2fa" in data) {
        setMfaToken(data.mfa_token);
        setMfaCode("");
        return;
      }
      await finishLogin(data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const detail = String(error.response?.data?.detail ?? "").toLowerCase();
        if (status === 400 || status === 401 || detail.includes("invalid")) {
          setErrorMessage("Invalid email or password.");
        } else if (!error.response) {
          setErrorMessage("Cannot reach server. Check connection and try again.");
        } else {
          setErrorMessage("Something went wrong. Please try again.");
        }
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
    if (!/^\d{6}$/.test(code) && !/^[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}$/.test(code)) {
      setErrorMessage("Enter a six-digit authenticator code or a valid recovery code.");
      return;
    }
    setIsSubmitting(true); setErrorMessage(null);
    try { await finishLogin(await verifyTwoFactor(mfaToken, code)); }
    catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setMfaToken(null); setMfaCode(""); setPassword("");
        setErrorMessage("Your verification session expired. Please sign in again.");
      } else if (axios.isAxiosError(error) && error.response?.status === 400) {
        setErrorMessage("Invalid authenticator or recovery code.");
      } else if (axios.isAxiosError(error) && !error.response) {
        setErrorMessage("Cannot reach server. Check connection and try again.");
      } else setErrorMessage("Something went wrong. Please try again.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <main className={styles.page}>
      <video
        className={styles.backgroundVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/images/auth/sign-in-background.png"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          src="/images/auth/login-background-hd.mp4?v=2"
          type="video/mp4"
        />
      </video>

      <div className={styles.loginContent}>
        <a href="#auth-form" className={styles.skipLink}>Skip to sign-in form</a>
        <header className={styles.header}>
          <Link href="/" aria-label="Coditent home">
            <Logo size="md" />
          </Link>
          <Link href="/offers/all" className={styles.headerLink}>
            Browse opportunities <span aria-hidden="true">↗</span>
          </Link>
        </header>

        <div className={styles.shell}>
          <section className={styles.formColumn} aria-labelledby="sign-in-title">
            <div className={styles.formInner}>
              <p className={styles.eyebrow}>Welcome back</p>
              <h1 id="sign-in-title" className={styles.title}>Continue your <em>career journey.</em></h1>
              <p className={styles.subtitle}>Sign in to return to your profile, applications, and conversations.</p>

              <div id="auth-form" className={styles.formArea}>
                {!mfaToken ? <div className={styles.roleTabs} role="tablist" aria-label="Account type">
                  {(["candidate", "recruiter"] as LoginRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={activeRole === r}
                      onClick={() => {
                        setActiveRole(r);
                        setErrorMessage(null);
                      }}
                      className={activeRole === r ? styles.roleTabActive : styles.roleTab}
                    >
                      {r === "candidate" ? "Candidate" : "Recruiter"}
                    </button>
                  ))}
                </div> : null}

                {mfaToken ? (
                <form className={styles.form} onSubmit={handleMfaSubmit}>
                  <p className={styles.subtitle}>Enter the code from your authenticator app, or use one of your recovery codes.</p>
                  <Input label="Authenticator or recovery code" id="mfa-code" autoFocus required autoComplete="one-time-code" inputMode="text" maxLength={20} value={mfaCode} disabled={isSubmitting} onChange={(e) => { setMfaCode(e.target.value); setErrorMessage(null); }} helper="Six digits or a recovery code such as AB12-CD34" />
                  {errorMessage ? <p id="login-error" role="alert" className={styles.error}>{errorMessage}</p> : null}
                  <Button type="submit" loading={isSubmitting} className={styles.submitButton}>Verify and continue</Button>
                  <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => { setMfaToken(null); setMfaCode(""); setErrorMessage(null); }}>Back to sign in</Button>
                </form>
                ) : <form className={styles.form} onSubmit={handleSubmit}>
                  <SocialLoginButtons className={styles.socialLogin} separator="or continue with email" />
                  <Input
                    label="Email"
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                    aria-describedby={errorMessage ? "login-error" : undefined}
                    className={styles.input}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage(null);
                    }}
                  />
                  <div>
                    <Input
                      label="Password"
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      placeholder="Your password"
                      disabled={isSubmitting}
                      aria-describedby={errorMessage ? "login-error" : undefined}
                      className={styles.input}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMessage(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className={styles.passwordToggle}
                    >
                      {showPassword ? "Hide password" : "Show password"}
                    </button>
                  </div>
                  {errorMessage ? (
                    <p id="login-error" role="alert" className={styles.error}>
                      {errorMessage}
                    </p>
                  ) : null}
                  <Button type="submit" loading={isSubmitting} className={styles.submitButton}>
                    {activeRole === "candidate" ? "Sign in as Candidate" : "Sign in as Recruiter"}
                  </Button>
                  <p className={styles.registerPrompt}>
                    New to Coditent?{" "}
                    <Link href={`/register?role=${activeRole}`}>Create an account</Link>
                  </p>
                </form>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
