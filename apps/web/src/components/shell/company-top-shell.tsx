"use client";

import Link from "next/link";
import { SupportButton } from "@/components/support/support-button";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { companyNavItems, isNavActive } from "./nav-config";
import styles from "./candidate-top-shell.module.css";
import homeStyles from "@/components/landing/landing-page.module.css";

interface CompanyTopShellProps {
  user: { name: string; email?: string; avatarUrl?: string | null };
  onLogout: () => void;
  children: ReactNode;
}

export function CompanyTopShell({ user, onLogout, children }: CompanyTopShellProps) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountPanelId = useId();
  const mobileMenuId = useId();

  useEffect(() => {
    setAccountOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event?: Event) => {
      const target = event?.target;
      const nestedScroll = target instanceof HTMLElement ? target.scrollTop : 0;
      const pageScroll = Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
      setScrolled(!reducedMotion.matches && Math.max(pageScroll, nestedScroll) > 48);
    };
    const onMotionChange = () => update();
    update();
    window.addEventListener("scroll", update, { passive: true });
    document.addEventListener("scroll", update, { passive: true, capture: true });
    reducedMotion.addEventListener("change", onMotionChange);
    return () => {
      window.removeEventListener("scroll", update);
      document.removeEventListener("scroll", update, { capture: true });
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    if (!accountOpen && !mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
      if (mobileOpen && headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
      if (mobileOpen) {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen, mobileOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#company-content">Skip to content</a>
      <header
        ref={headerRef}
        className={`${homeStyles.homeHeader} ${scrolled ? homeStyles.homeHeaderScrolled : ""}`}
        onBlurCapture={(event) => {
          if (mobileOpen && !event.currentTarget.contains(event.relatedTarget)) setMobileOpen(false);
        }}
      >
        <div className={homeStyles.homeNav}>
          <Link href="/company" aria-label="Coditent home" className={homeStyles.homeBrand}>
            <Logo size="md" />
          </Link>

          <nav aria-label="Company navigation" className={`${homeStyles.homeNavLinks} ${styles.companyNav}`}>
            {companyNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavActive(pathname, item) ? "page" : undefined}
                className={isNavActive(pathname, item) ? styles.navLinkActive : styles.navLink}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div ref={accountRef} className={`${styles.account} ${homeStyles.homeActions}`}>
            <button
              ref={accountButtonRef}
              type="button"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              aria-controls={accountPanelId}
              onClick={() => setAccountOpen((open) => !open)}
              className={homeStyles.homeProfileLink}
            >
              <Avatar name={user.name} src={user.avatarUrl} size="md" className={homeStyles.homeProfileAvatar} />
            </button>
            {accountOpen ? (
              <div id={accountPanelId} className={styles.accountPanel}>
                <div className={styles.accountHeader}>
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <div className={styles.accountInfo}>
                    <strong>{user.name}</strong>
                    <small>{user.email ?? "Company account"}</small>
                  </div>
                </div>
                <div className={styles.accountDivider} />
                <Link href="/company/settings" onClick={() => setAccountOpen(false)}>Company settings</Link>
                <LegalLinks layout="column" onNavigate={() => setAccountOpen(false)} />
                <div className={styles.accountDivider} />
                <button type="button" onClick={onLogout} className={styles.accountPanelButton}>Log out</button>
              </div>
            ) : null}
          </div>

          <div className={homeStyles.homeMobile}>
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((open) => !open)}
              className={homeStyles.homeProfileLink}
            >
              <Avatar name={user.name} src={user.avatarUrl} size="sm" className={homeStyles.homeProfileAvatar} />
            </button>
            <button
              type="button"
              ref={menuButtonRef}
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls={mobileMenuId}
              className={homeStyles.homeMenuButton}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d={mobileOpen ? "M6 6l12 12M18 6 6 18" : "M4 8h16M4 16h16"} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div id={mobileMenuId} className={homeStyles.homeMobilePanel}>
            <nav aria-label="Mobile navigation" className={homeStyles.homeMobileNav}>
              {companyNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isNavActive(pathname, item) ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={isNavActive(pathname, item) ? styles.mobileActiveLink : undefined}
                >
                  {item.label}
                </Link>
              ))}
              <div className={styles.mobileDivider} />
              <Link
                href="/company/settings"
                onClick={() => setMobileOpen(false)}
                className={`${homeStyles.homeMobileLogin} ${homeStyles.homeMobileAccount}`}
              >
                <span className={homeStyles.homeMobileAccountIdentity}>
                  <Avatar src={user.avatarUrl} name={user.name} size="sm" />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email ?? "Company account"}</small>
                  </span>
                </span>
                <span aria-hidden="true">⚙</span>
              </Link>
              <button type="button" onClick={onLogout} className={styles.mobileLogoutButton}>
                Log out <span aria-hidden="true">→</span>
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      <>
        <main id="company-content" className={styles.content}>{children}</main>
        <SupportButton />
      </>
    </div>
  );
}
