import Link from "next/link";

import { MdCard } from "@/components/ui/md-card";

export default function PendingApprovalPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-md-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-20 top-12 h-80 w-80 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/3 h-96 w-96 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-md-secondaryContainer/50 blur-3xl" />
      </div>

      <MdCard className="relative w-full max-w-2xl rounded-md-2xl border-md-outline/20 p-8 shadow-md-lg sm:p-10">
        <p className="inline-flex rounded-full bg-md-secondaryContainer px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-md-onSecondaryContainer">
          Recruiter status
        </p>

        <h1 className="mt-4 text-3xl font-medium leading-tight sm:text-4xl">Your recruiter account is pending approval.</h1>

        <p className="mt-4 max-w-xl text-base leading-7 text-md-onSurfaceVariant">
          An admin needs to approve your recruiter access before offer management and recruiter tools
          are available. This usually happens quickly.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-md-primary px-6 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
            href="/login"
          >
            Back to sign in
          </Link>

          <Link
            className="inline-flex h-11 items-center justify-center rounded-full border border-md-outline/60 px-6 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
            href="/"
          >
            Return home
          </Link>
        </div>
      </MdCard>
    </main>
  );
}
