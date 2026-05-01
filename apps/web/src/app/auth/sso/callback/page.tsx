"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MdCard } from "@/components/ui/md-card";
import { getMe } from "@/lib/api";

export default function SsoCallbackPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isParsed, setIsParsed] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setErrorCode(query.get("error"));
    setIsParsed(true);
  }, []);

  const readableError = useMemo(() => {
    if (!errorCode) {
      return null;
    }

    const normalized = errorCode.replace(/_/g, " ");
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
  }, [errorCode]);

  useEffect(() => {
    if (!isParsed || errorCode) {
      return;
    }
    let isMounted = true;

    async function finalizeLogin() {
      try {
        const user = await getMe();
        if (!isMounted) {
          return;
        }
        setRole(user.role ?? null);
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
      } catch (error) {
        if (!isMounted) {
          return;
        }
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
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-md-background px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="md-glow absolute -left-10 top-1/4 h-64 w-64 rounded-full bg-md-primary/20 blur-3xl" />
          <div className="md-glow absolute right-0 top-1/3 h-64 w-64 rounded-full bg-md-tertiary/20 blur-3xl" />
        </div>

        <MdCard className="relative w-full max-w-md rounded-md-2xl p-8 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-md-outline/30 border-t-md-primary" />
          <h1 className="mt-4 text-xl font-medium">Preparing sign-in...</h1>
        </MdCard>
      </main>
    );
  }

  if (readableError) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-md-background px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="md-glow absolute -left-10 top-1/4 h-64 w-64 rounded-full bg-md-primary/20 blur-3xl" />
          <div className="md-glow absolute right-0 top-1/3 h-64 w-64 rounded-full bg-md-tertiary/20 blur-3xl" />
        </div>

        <MdCard className="relative w-full max-w-md rounded-md-2xl p-8 text-center">
          <h1 className="text-2xl font-medium">SSO login failed</h1>
          <p className="mt-3 text-sm text-md-onSurfaceVariant">{readableError}</p>
          <Link
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-md-primary px-6 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
            href="/login"
          >
            Back to login
          </Link>
        </MdCard>
      </main>
    );
  }

  if (!role && isParsed && !readableError) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-md-background px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="md-glow absolute -left-10 top-1/4 h-64 w-64 rounded-full bg-md-primary/20 blur-3xl" />
          <div className="md-glow absolute right-0 top-1/3 h-64 w-64 rounded-full bg-md-tertiary/20 blur-3xl" />
        </div>

        <MdCard className="relative w-full max-w-md rounded-md-2xl p-8 text-center">
          <h1 className="text-2xl font-medium">Completing SSO login</h1>
          <p className="mt-3 text-sm text-md-onSurfaceVariant">Confirming your session with the API.</p>
          <Link
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-md-primary px-6 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
            href="/login"
          >
            Back to login
          </Link>
        </MdCard>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-md-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-10 top-1/4 h-64 w-64 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/3 h-64 w-64 rounded-full bg-md-tertiary/20 blur-3xl" />
      </div>

      <MdCard className="relative w-full max-w-md rounded-md-2xl p-8 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-md-outline/30 border-t-md-primary" />
        <h1 className="mt-4 text-xl font-medium">Signing you in...</h1>
        <p className="mt-2 text-sm text-md-onSurfaceVariant">Please wait while your workspace is prepared.</p>
      </MdCard>
    </main>
  );
}
