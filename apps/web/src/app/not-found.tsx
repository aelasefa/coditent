import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-md-background p-4 text-center">
      <h1 className="text-4xl font-bold text-md-primary">404</h1>
      <p className="mt-2 text-lg text-md-onSurfaceVariant">Page not found</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-md-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Return Home
      </Link>
    </main>
  );
}
