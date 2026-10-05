"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FiChevronDown } from "react-icons/fi";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
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
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountPanelId = useId();

  useEffect(() => {
    setAccountOpen(false);
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
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#company-content">Skip to content</a>
      <header className={`${homeStyles.homeHeader} ${scrolled ? homeStyles.homeHeaderScrolled : ""}`}>
        <div className={homeStyles.homeNav}>
          <Link href="/company" aria-label="Coditent home" className={homeStyles.homeBrand}>
            <Logo size="md" />
          </Link>

          <nav aria-label="Company navigation" className={homeStyles.homeNavLinks}>
            {companyNavItems.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isNavActive(pathname, item) ? "page" : undefined} className={isNavActive(pathname, item) ? styles.navLinkActive : styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div ref={accountRef} className={`${styles.account} ${homeStyles.homeActions}`}>
            <button ref={accountButtonRef} type="button" aria-label="Account menu" aria-expanded={accountOpen} aria-controls={accountPanelId} onClick={() => setAccountOpen((open) => !open)} className={styles.accountButton}>
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <span className={styles.accountName}>{user.name}</span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {accountOpen ? (
              <div id={accountPanelId} className={styles.accountPanel}>
                <p className={styles.accountEmail}>{user.email ?? "Company account"}</p>
                <Link href="/company/settings" onClick={() => setAccountOpen(false)}>Company settings</Link>
                <button type="button" onClick={onLogout}>Log out</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <>
        <main id="company-content" className={styles.content}>{children}</main>
      </>
    </div>
  );
}
