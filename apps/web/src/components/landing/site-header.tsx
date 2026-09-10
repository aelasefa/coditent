"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";

const LINKS = [
  { label: "For Candidates", href: "#candidates" },
  { label: "For Companies", href: "#companies" },
  { label: "Opportunities", href: "/offers/all" },
  { label: "How it Works", href: "#how-it-works" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/95 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Coditent home">
          <Logo size="md" />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-secondary hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground">
            Log in
          </Link>
          <Link href="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
            Get Started
          </Link>
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary">
            Log in
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="rounded-lg p-2.5 text-foreground hover:bg-surface-secondary"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" side="right" size="sm">
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-[15px] font-medium text-foreground hover:bg-surface-secondary">
              {l.label}
            </Link>
          ))}
          <Link href="/register" onClick={() => setOpen(false)} className="mt-2 rounded-lg bg-primary px-3 py-3 text-center text-[15px] font-semibold text-primary-foreground">
            Get Started
          </Link>
        </nav>
      </Sheet>
    </header>
  );
}
