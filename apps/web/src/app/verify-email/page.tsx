"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { resendVerification, verifyEmail } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import authStyles from "../(auth)/login/login-page.module.css";
import styles from "./verify-email.module.css";

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [otp, setOtp] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function handleVerify(event?: React.FormEvent, explicitCode?: string) {
    event?.preventDefault();
    const code = (explicitCode ?? otp).trim();
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("Enter the 6-digit code from your email.");
      return;
    }
    if (isVerifying) return;
    setIsVerifying(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const data = await verifyEmail({ email, otp: code });
      saveToken(data.token);
      router.push("/get-started");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        const msg = typeof detail === "string" ? detail : "Verification failed.";
        setErrorMessage(msg);
        if (/expired|attempts|register again/i.test(msg)) {
          setInfoMessage("Start over from the registration page to get a fresh code.");
        }
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (isResending || cooldown > 0) return;
    setIsResending(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await resendVerification(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfoMessage("A new code was sent to your email.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (detail && typeof detail === "object" && "retry_after_seconds" in detail) {
          const wait = Number((detail as { retry_after_seconds?: number }).retry_after_seconds || 0);
          setCooldown(wait > 0 ? wait : RESEND_COOLDOWN_SECONDS);
          setErrorMessage("Please wait before requesting a new code.");
        } else {
          const msg = typeof detail === "string" ? detail : "Could not resend the code.";
          setErrorMessage(msg);
        }
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setIsResending(false);
    }
  }

  // Auto-submit once 6 digits are typed; guard prevents double submits.
  function handleOtpChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    setErrorMessage(null);
    if (digits.length === 6 && !isVerifying) {
      void handleVerify(undefined, digits);
    }
  }

  return (
    <main className={authStyles.page}>
      <video
        className={authStyles.backgroundVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/images/auth/sign-in-background.png"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src="/images/auth/login-background-full-hd.mp4" type="video/mp4" />
      </video>

      <div className={authStyles.loginContent}>
        <a href="#auth-form" className={authStyles.skipLink}>Skip to verification form</a>
        <header className={authStyles.header}>
          <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
          <Link href="/offers/all" className={authStyles.headerLink}>
            Browse opportunities <span aria-hidden="true">↗</span>
          </Link>
        </header>

        <div className={`${authStyles.shell} ${styles.shell}`}>
          <section className={authStyles.formColumn} aria-labelledby="verify-title">
            <div className={`${authStyles.formInner} ${styles.formInner}`}>
              <p className={authStyles.eyebrow}>One final step</p>
              <h1 id="verify-title" className={authStyles.title}>Verify your <em>email.</em></h1>
              <p className={authStyles.subtitle}>
                {email ? <>We sent a six-digit code to <strong className={styles.email}>{email}</strong>.</> : "Register first and we will send you a verification code."}
              </p>

              <div id="auth-form" className={`${authStyles.formArea} ${styles.formArea}`}>
                {email ? (
                  <>
                    <div className={styles.expiryNotice}>
                      <span className={styles.noticeDot} aria-hidden="true" />
                      The code expires in 5 minutes. Do not share it with anyone.
                    </div>

                    <form onSubmit={handleVerify} className={`${authStyles.form} ${styles.form}`}>
                      <Input
                        label="Verification code"
                        id="otp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={6}
                        value={otp}
                        disabled={isVerifying}
                        autoFocus
                        className={`${authStyles.input} ${styles.codeInput}`}
                        onChange={(e) => handleOtpChange(e.target.value)}
                      />
                      {errorMessage ? <p role="alert" className={authStyles.error}>{errorMessage}</p> : null}
                      {infoMessage ? <p role="status" className={styles.info}>{infoMessage}</p> : null}
                      <Button type="submit" loading={isVerifying} disabled={otp.trim().length !== 6} className={authStyles.submitButton}>
                        Verify and continue
                      </Button>
                    </form>

                    <div className={styles.actions}>
                      {cooldown > 0 ? (
                        <span role="status">Resend available in {cooldown}s</span>
                      ) : (
                        <button type="button" onClick={handleResend} disabled={isResending} className={styles.textButton}>
                          {isResending ? "Sending…" : "Resend code"}
                        </button>
                      )}
                      <span aria-hidden="true">·</span>
                      <Link href="/register">Use a different email</Link>
                    </div>

                    <p className={styles.deliveryHelp}>Not in your inbox? Check Spam and mark the message as “Not spam”.</p>
                  </>
                ) : (
                  <div className={styles.missingEmail}>
                    <p>We need your email address before we can verify your account.</p>
                    <Link href="/register" className={styles.primaryLink}>Back to registration</Link>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
