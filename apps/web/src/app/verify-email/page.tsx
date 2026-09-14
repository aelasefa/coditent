"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resendVerification, verifyEmail } from "@/lib/api";
import { saveToken } from "@/lib/auth";

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
      router.push("/profile");
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

  if (!email) {
    return (
      <AuthLayout title="Check your email" subtitle="We need your email address first.">
        <p className="text-sm text-muted-foreground">Register first and we will send a verification code.</p>
        <Link href="/register" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Back to registration
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Check your email" subtitle={`We sent a verification code to ${email}.`}>
      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label="Verification code"
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          maxLength={6}
          value={otp}
          disabled={isVerifying}
          onChange={(e) => handleOtpChange(e.target.value)}
        />
        {errorMessage ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorMessage}
          </p>
        ) : null}
        {infoMessage ? (
          <p role="status" className="text-sm text-muted-foreground">
            {infoMessage}
          </p>
        ) : null}
        <Button type="submit" loading={isVerifying} disabled={otp.trim().length !== 6} className="w-full">
          Verify
        </Button>
      </form>
      <div className="mt-4 text-center text-sm text-muted-foreground">
        {cooldown > 0 ? (
          <span role="status">Resend available in {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
          >
            {isResending ? "Sending…" : "Resend code"}
          </button>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Start over
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
