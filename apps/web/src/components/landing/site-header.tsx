"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { getMe } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { getAuthenticatedDestination } from "@/lib/auth-redirect";
import styles from "./landing-page.module.css";

const LINKS = [
  { label: "For Candidates", href: "/#candidates" },
  { label: "For Companies", href: "/#companies" },
  { label: "Opportunities", href: "/offers/all" },
  { label: "How it Works", href: "/#how-it-works" },
];

export function SiteHeader({ variant = "standard" }: { variant?: "standard" | "home" | "floating" }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState<boolean | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuId = useId();
  const floating = variant === "home" || variant === "floating";
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: hasStoredSession === true,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const currentUser = hasStoredSession && !meQuery.isError ? meQuery.data : undefined;
  const authPending = hasStoredSession === null || (hasStoredSession && meQuery.isLoading);
  const accountHref = currentUser ? getAuthenticatedDestination(currentUser) : "/login";

  useEffect(() => {
    const syncSession = () => setHasStoredSession(isLoggedIn());
    syncSession();
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  useEffect(() => {
    // A 401 response clears the saved token in the API interceptor.
    if (meQuery.isError && !isLoggedIn()) setHasStoredSession(false);
  }, [meQuery.isError]);

  useEffect(() => {
    if (!floating) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setScrolled(!reducedMotion.matches && window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    reducedMotion.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, [floating]);

  useEffect(() => {
    if (!floating || !open) return;
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
  }, [floating, open]);

  return (
    <header
      ref={headerRef}
      className={floating ? `${styles.homeHeader} ${scrolled ? styles.homeHeaderScrolled : ""}` : "sticky top-0 z-40 border-b border-border-subtle bg-background/95 backdrop-blur-md"}
      onBlurCapture={(event) => {
        if (floating && open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <div className={floating ? styles.homeNav : "mx-auto flex h-[4.5rem] w-[min(100%-2rem,1280px)] items-center justify-between gap-3 lg:grid lg:w-[min(100%-3rem,1280px)] lg:grid-cols-[1fr_auto_1fr]"}>
        <Link href="/" aria-label="Coditent home" className={floating ? styles.homeBrand : undefined}>
          <Logo size="md" />
        </Link>
        <nav aria-label="Primary" className={floating ? styles.homeNavLinks : "hidden items-center gap-0.5 lg:flex"}>
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={floating ? undefined : "rounded-lg px-3 py-2 text-[13px] font-semibold text-foreground-secondary hover:bg-surface-secondary hover:text-primary"}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={floating ? styles.homeActions : "hidden items-center justify-self-end gap-2 lg:flex"}>
          {currentUser ? (
            <Link
              href={accountHref}
              className={styles.homeProfileLink}
              aria-label={`Open ${currentUser.full_name}'s account`}
              title={`Open ${currentUser.full_name}'s account`}
            >
              <Avatar src={currentUser.avatar_url} name={currentUser.full_name} size="md" className={styles.homeProfileAvatar} />
            </Link>
          ) : authPending ? (
            <span className={styles.homeAuthPlaceholder} aria-hidden="true" />
          ) : (
            <>
              <Link href="/login" className={floating ? styles.homeLogin : "rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground"}>
                Log in
              </Link>
              <Link href="/register" className={floating ? styles.homeCta : "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"}>
                Get Started
              </Link>
            </>
          )}
        </div>
        <div className={floating ? styles.homeMobile : "flex items-center gap-1 lg:hidden"}>
          {currentUser ? (
            <Link
              href={accountHref}
              className={styles.homeProfileLink}
              aria-label={`Open ${currentUser.full_name}'s account`}
              title={`Open ${currentUser.full_name}'s account`}
            >
              <Avatar src={currentUser.avatar_url} name={currentUser.full_name} size="sm" className={styles.homeProfileAvatar} />
            </Link>
          ) : authPending ? (
            <span className={styles.homeMobileAuthPlaceholder} aria-hidden="true" />
          ) : (
            <Link href={floating ? "/register" : "/login"} className={floating ? styles.homeCta : "rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary"}>
              {floating ? "Get Started" : "Log in"}
            </Link>
          )}
          <button
            type="button"
            ref={menuButtonRef}
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls={floating ? mobileMenuId : undefined}
            className={floating ? styles.homeMenuButton : "rounded-lg p-2.5 text-foreground hover:bg-surface-secondary"}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d={floating ? (open ? "M6 6l12 12M18 6 6 18" : "M4 8h16M4 16h16") : "M3 6h18M3 12h18M3 18h18"} strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {floating ? (
        <div id={mobileMenuId} hidden={!open} className={styles.homeMobilePanel}>
          <nav aria-label="Mobile" className={styles.homeMobileNav}>
            {LINKS.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            {currentUser ? (
              <Link href={accountHref} onClick={() => setOpen(false)} className={`${styles.homeMobileLogin} ${styles.homeMobileAccount}`}>
                <span className={styles.homeMobileAccountIdentity}>
                  <Avatar src={currentUser.avatar_url} name={currentUser.full_name} size="sm" />
                  <span>
                    <strong>{currentUser.full_name}</strong>
                    <small>Open your account</small>
                  </span>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
            ) : authPending ? (
              <span className={`${styles.homeMobileLogin} ${styles.homeMobileAccountPlaceholder}`} aria-hidden="true" />
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className={styles.homeMobileLogin}>
                Log in <span aria-hidden="true">↗</span>
              </Link>
            )}
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
            {currentUser ? (
              <Link href={accountHref} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2.5 text-[15px] font-semibold text-foreground">
                <Avatar src={currentUser.avatar_url} name={currentUser.full_name} size="sm" />
                <span>{currentUser.full_name}</span>
              </Link>
            ) : authPending ? (
              <span className="mt-2 h-12 rounded-lg bg-surface-secondary" aria-hidden="true" />
            ) : (
              <Link href="/register" onClick={() => setOpen(false)} className="mt-2 rounded-lg bg-primary px-3 py-3 text-center text-[15px] font-semibold text-primary-foreground">
                Get Started
              </Link>
            )}
          </nav>
        </Sheet>
      )}
    </header>
  );
}
