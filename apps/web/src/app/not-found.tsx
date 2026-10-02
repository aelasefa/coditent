import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAF9] px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Error 404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          The page you are looking for does not exist or may have been moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Return home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
