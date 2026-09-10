"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getMe } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/constants";

export default function SsoCallbackPage() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isParsed, setIsParsed] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get("token");
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      document.cookie = `${AUTH_TOKEN_KEY}=${token}; path=/; max-age=2592000; SameSite=Lax; secure`;
    }
    setErrorCode(query.get("error"));
    setIsParsed(true);
  }, []);

  const readableError = useMemo(() => {
    if (!errorCode) return null;
    const normalized = errorCode.replace(/_/g, " ");
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
  }, [errorCode]);

  useEffect(() => {
    if (!isParsed || errorCode) return;
    let isMounted = true;
    async function finalizeLogin() {
      try {
        const user = await getMe();
        if (!isMounted) return;
        localStorage.setItem("user", JSON.stringify(user));
        if (user.role === "ADMIN") {
          router.replace("/admin");
          return;
        }
        if (user.role === "RECRUITER") {
          router.replace("/recruiter");
          return;
        }
        router.replace("/dashboard");
      } catch {
        if (!isMounted) return;
        setErrorCode("sso_session_missing");
      }
    }
    finalizeLogin();
    return () => {
      isMounted = false;
    };
  }, [isParsed, errorCode, router]);

  if (!isParsed) {
    return (
      <AuthLayout title="Preparing sign-in" subtitle="Reading SSO response.">
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      </AuthLayout>
    );
  }

  if (readableError) {
    return (
      <AuthLayout title="SSO login failed" subtitle={readableError}>
        <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Completing SSO login" subtitle="Confirming session with API.">
      <p role="status" className="text-sm text-muted-foreground">Signing you in…</p>
      <Link href="/login" className="mt-4 inline-block text-sm font-medium text-muted-foreground underline">
        Back to login
      </Link>
    </AuthLayout>
  );
}
