import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#auth-form" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to form
      </a>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Coditent home">
          <Logo size="md" />
        </Link>
        <Link href="/offers/all" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Browse opportunities
        </Link>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:pt-10">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div id="auth-form" className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
