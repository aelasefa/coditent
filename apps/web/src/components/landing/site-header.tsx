"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import styles from "./landing-page.module.css";

const LINKS = [
  { label: "For Candidates", href: "#candidates" },
  { label: "For Companies", href: "#companies" },
  { label: "Opportunities", href: "/offers/all" },
  { label: "How it Works", href: "#how-it-works" },
];

export function SiteHeader({ variant = "standard" }: { variant?: "standard" | "home" }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuId = useId();
  const home = variant === "home";

  useEffect(() => {
    if (!home) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setScrolled(!reducedMotion.matches && window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    reducedMotion.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, [home]);

  useEffect(() => {
    if (!home || !open) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [home, open]);

  return (
    <header
      ref={headerRef}
      className={home ? `${styles.homeHeader} ${scrolled ? styles.homeHeaderScrolled : ""}` : "sticky top-0 z-40 border-b border-border-subtle bg-background/95 backdrop-blur-md"}
      onBlurCapture={(event) => {
        if (home && open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <div className={home ? styles.homeNav : "mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6"}>
        <Link href="/" aria-label="Coditent home" className={home ? styles.homeBrand : undefined}>
          <Logo size="md" />
        </Link>
        <nav aria-label="Primary" className={home ? styles.homeNavLinks : "hidden items-center gap-1 lg:flex"}>
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={home ? undefined : "rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={home ? styles.homeActions : "hidden items-center gap-2 lg:flex"}>
          <Link href="/login" className={home ? styles.homeLogin : "rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground"}>
            Log in
          </Link>
          <Link href="/register" className={home ? styles.homeCta : "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"}>
            Get Started
          </Link>
        </div>
        <div className={home ? styles.homeMobile : "flex items-center gap-1 lg:hidden"}>
          <Link href={home ? "/register" : "/login"} className={home ? styles.homeCta : "rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary"}>
            {home ? "Get Started" : "Log in"}
          </Link>
          <button
            type="button"
            ref={menuButtonRef}
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls={home ? mobileMenuId : undefined}
            className={home ? styles.homeMenuButton : "rounded-lg p-2.5 text-foreground hover:bg-surface-secondary"}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d={home ? (open ? "M6 6l12 12M18 6 6 18" : "M4 8h16M4 16h16") : "M3 6h18M3 12h18M3 18h18"} strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {home ? (
        <div id={mobileMenuId} hidden={!open} className={styles.homeMobilePanel}>
          <nav aria-label="Mobile" className={styles.homeMobileNav}>
            {LINKS.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className={styles.homeMobileLogin}>
              Log in <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      ) : (
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
      )}
    </header>
  );
}
