import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-3xl border border-border-subtle bg-surface p-8 text-center shadow-md sm:p-12">
        <Link href="/" aria-label="Coditent home" className="inline-flex"><Logo size="md" /></Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-primary">Error 404</p>
        <h1 className="mt-3 font-serif text-5xl font-normal tracking-[-0.045em] text-foreground">
          Page not found.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
          The page you are looking for does not exist or may have been moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Return home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
