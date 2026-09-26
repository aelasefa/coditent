"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FiChevronDown, FiMenu, FiX } from "react-icons/fi";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { candidateNavItems, isNavActive, type NavItem } from "./nav-config";
import styles from "./candidate-top-shell.module.css";

interface CandidateTopShellProps {
  user: { name: string; email?: string; avatarUrl?: string | null };
  onLogout: () => void;
  children: React.ReactNode;
}

const CandidateAvatarPreviewContext = createContext<Dispatch<SetStateAction<string | null>> | null>(null);

export function useCandidateAvatarPreview() {
  const setAvatarPreview = useContext(CandidateAvatarPreviewContext);
  if (!setAvatarPreview) throw new Error("Candidate avatar preview requires CandidateTopShell");
  return setAvatarPreview;
}

function activeForPath(pathname: string, item: NavItem): boolean {
  return isNavActive(pathname, item) || (item.href === "/profile" && pathname === "/dashboard/profile");
}

export function CandidateTopShell({ user, onLogout, children }: CandidateTopShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
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
      <a className={styles.skipLink} href="#candidate-content">Skip to content</a>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/dashboard" aria-label="Coditent home" className={styles.brand}>
            <Logo size="md" />
          </Link>

          <nav aria-label="Candidate navigation" className={styles.desktopNav}>
            {candidateNavItems.map((item) => (
              <Link key={item.href} href={item.href} aria-current={activeForPath(pathname, item) ? "page" : undefined} className={activeForPath(pathname, item) ? styles.navLinkActive : styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div ref={accountRef} className={styles.account}>
            <button ref={accountButtonRef} type="button" aria-label="Account menu" aria-expanded={accountOpen} aria-controls={accountPanelId} onClick={() => setAccountOpen((open) => !open)} className={styles.accountButton}>
              <Avatar name={user.name} src={avatarPreview ?? user.avatarUrl} size="sm" />
              <span className={styles.accountName}>{user.name}</span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {accountOpen ? (
              <div id={accountPanelId} className={styles.accountPanel}>
                <p className={styles.accountEmail}>{user.email ?? "Candidate account"}</p>
                <Link href="/profile" onClick={() => setAccountOpen(false)}>View profile</Link>
                <Link href="/dashboard/settings" onClick={() => setAccountOpen(false)}>Settings</Link>
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
              <nav aria-label="Candidate navigation" className={styles.mobileNav}>
                {candidateNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} aria-current={activeForPath(pathname, item) ? "page" : undefined} onClick={() => setMobileOpen(false)} className={activeForPath(pathname, item) ? styles.mobileLinkActive : styles.mobileLink}>
                      <span aria-hidden="true"><Icon /></span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className={styles.mobileAccount}>
                <div><Avatar name={user.name} src={avatarPreview ?? user.avatarUrl} size="sm" /><span><strong>{user.name}</strong>{user.email ? <small>{user.email}</small> : null}</span></div>
                <Link href="/dashboard/settings" onClick={() => setMobileOpen(false)}>Settings</Link>
                <button type="button" onClick={onLogout}>Log out</button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <CandidateAvatarPreviewContext.Provider value={setAvatarPreview}>
        <main id="candidate-content" className={styles.content}>{children}</main>
      </CandidateAvatarPreviewContext.Provider>
    </div>
  );
}
