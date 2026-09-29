"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FiChevronDown, FiMenu, FiX } from "react-icons/fi";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { companyNavItems, isNavActive } from "./nav-config";
import styles from "./candidate-top-shell.module.css";

interface CompanyTopShellProps {
  user: { name: string; email?: string; avatarUrl?: string | null };
  onLogout: () => void;
  children: ReactNode;
}

export function CompanyTopShell({ user, onLogout, children }: CompanyTopShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
    const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileNavId = useId();
  const accountPanelId = useId();

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
      if (mobileOpen && headerRef.current && !headerRef.current.contains(event.target as Node)) setMobileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
      if (mobileOpen) {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, accountOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#company-content">Skip to content</a>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/company" aria-label="Coditent home" className={styles.brand}>
            <Logo size="md" />
          </Link>

          <nav aria-label="Company navigation" className={styles.desktopNav}>
            {companyNavItems.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isNavActive(pathname, item) ? "page" : undefined} className={isNavActive(pathname, item) ? styles.navLinkActive : styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div ref={accountRef} className={styles.account}>
            <button ref={accountButtonRef} type="button" aria-label="Account menu" aria-expanded={accountOpen} aria-controls={accountPanelId} onClick={() => setAccountOpen((open) => !open)} className={styles.accountButton}>
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <span className={styles.accountName}>{user.name}</span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {accountOpen ? (
              <div id={accountPanelId} className={styles.accountPanel}>
                <p className={styles.accountEmail}>{user.email ?? "Company account"}</p>
                <Link href="/company/settings" onClick={() => setAccountOpen(false)}>View profile</Link>
                <Link href="/company/settings" onClick={() => setAccountOpen(false)}>Settings</Link>
                <button type="button" onClick={onLogout}>Log out</button>
              </div>
            ) : null}
          </div>

          <button ref={mobileButtonRef} type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls={mobileNavId} onClick={() => setMobileOpen((open) => !open)} className={styles.mobileToggle}>
            {mobileOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          </button>
        </div>

        {mobileOpen ? (
          <div id={mobileNavId} className={styles.mobilePanel}>
            <div className={styles.mobilePanelInner}>
              <nav aria-label="Company navigation" className={styles.mobileNav}>
                {companyNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} aria-current={isNavActive(pathname, item) ? "page" : undefined} onClick={() => setMobileOpen(false)} className={isNavActive(pathname, item) ? styles.mobileLinkActive : styles.mobileLink}>
                      <span aria-hidden="true"><Icon /></span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className={styles.mobileAccount}>
                <div><Avatar name={user.name} src={user.avatarUrl} size="sm" /><span><strong>{user.name}</strong>{user.email ? <small>{user.email}</small> : null}</span></div>
                <Link href="/company/settings" onClick={() => setMobileOpen(false)}>Settings</Link>
                <button type="button" onClick={onLogout}>Log out</button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <>
        <main id="company-content" className={styles.content}>{children}</main>
      </>
    </div>
  );
}
