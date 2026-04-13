"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { saveToken } from "@/lib/auth";

export default function SsoCallbackPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isParsed, setIsParsed] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setToken(query.get("token"));
    setRole(query.get("role"));
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
    if (!isParsed || !token) {
      return;
    }

    saveToken(token);

    if (role === "RECRUITER") {
      router.replace("/recruiter");
      return;
    }

    router.replace("/profile");
  }, [isParsed, token, role, router]);

  if (!isParsed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
        <h1 className="text-lg font-semibold text-slate-900">Preparing sign-in...</h1>
      </main>
    );
  }

  if (readableError) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">SSO login failed</h1>
        <p className="text-sm text-slate-600">{readableError}</p>
        <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/login">
          Back to login
        </Link>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Missing SSO token</h1>
        <p className="text-sm text-slate-600">Try signing in again from the login page.</p>
        <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/login">
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
      <h1 className="text-lg font-semibold text-slate-900">Signing you in...</h1>
      <p className="text-sm text-slate-600">Please wait while we prepare your workspace.</p>
    </main>
  );
}
