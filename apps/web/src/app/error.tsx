"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global_error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-3xl border border-border-subtle bg-surface p-8 text-center shadow-md sm:p-12">
        <Link href="/" aria-label="Coditent home" className="inline-flex"><Logo size="md" /></Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-danger">Something went wrong</p>
        <h1 className="mt-3 font-serif text-5xl font-normal tracking-[-0.045em] text-foreground">
          An unexpected error occurred.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
          Please try again. If the problem persists, contact support.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
