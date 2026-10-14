import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { LegalLinks } from "./legal-links";

export function LegalPage({
  title,
  currentPath,
  children,
}: {
  title: string;
  currentPath: "/privacy" | "/terms";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#legal-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3">
        Skip to content
      </a>
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
          <Link href="/" className="rounded-sm text-sm font-medium text-foreground-secondary underline underline-offset-4 hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>
      <main id="legal-content" tabIndex={-1} aria-labelledby="legal-title" className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 id="legal-title" className="mt-3 font-serif text-5xl font-normal tracking-[-0.045em] sm:text-6xl">{title}</h1>
        <p className="mt-3 text-sm text-foreground-secondary">Effective: <time dateTime="2026-10-14">14 October 2026</time> — Coditent, Morocco</p>
        <div className="mt-10 space-y-9 break-words text-base leading-7 text-foreground-secondary [&_h2]:mb-3 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:mt-2">
          {children}
        </div>
      </main>
      <footer className="border-t border-border-subtle">
        <LegalLinks currentPath={currentPath} className="mx-auto max-w-3xl px-6 py-6" />
      </footer>
    </div>
  );
}
