"use client";

import Link from "next/link";
import { SupportButton } from "@/components/support/support-button";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FiChevronDown, FiMoreHorizontal } from "react-icons/fi";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { candidateNavItems, isNavActive, type NavItem } from "./nav-config";
import styles from "./candidate-top-shell.module.css";
import homeStyles from "@/components/landing/landing-page.module.css";

interface CandidateTopShellProps {
  user: { name: string; email?: string; avatarUrl?: string | null };
  onLogout: () => void;
  children: React.ReactNode;
}

const CandidateAvatarPreviewContext = createContext<Dispatch<SetStateAction<string | null>> | null>(null);
const secondaryNavLabels = new Set(["Practice", "Friends"]);

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileNavId = useId();
  const morePanelId = useId();
  const accountPanelId = useId();
  const primaryNavItems = candidateNavItems.filter((item) => !secondaryNavLabels.has(item.label));
  const secondaryNavItems = candidateNavItems.filter((item) => secondaryNavLabels.has(item.label));
  const moreIsActive = secondaryNavItems.some((item) => activeForPath(pathname, item));

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
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
    if (!mobileOpen && !moreOpen && !accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
      if (moreOpen && moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
      if (mobileOpen && headerRef.current && !headerRef.current.contains(event.target as Node)) setMobileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
      if (moreOpen) {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
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
  }, [mobileOpen, moreOpen, accountOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#candidate-content">Skip to content</a>
      <header
        ref={headerRef}
        className={`${homeStyles.homeHeader} ${scrolled ? homeStyles.homeHeaderScrolled : ""}`}
        onBlurCapture={(event) => {
          if (mobileOpen && !event.currentTarget.contains(event.relatedTarget)) setMobileOpen(false);
        }}
      >
        <div className={homeStyles.homeNav}>
          <Link href="/dashboard" aria-label="Coditent home" className={homeStyles.homeBrand}>
            <Logo size="md" />
          </Link>

          <nav aria-label="Candidate navigation" className={homeStyles.homeNavLinks}>
            {primaryNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activeForPath(pathname, item) ? "page" : undefined}
                className={activeForPath(pathname, item) ? styles.navLinkActive : styles.navLink}
              >
                {item.label}
              </Link>
            ))}
            <div ref={moreRef} className={styles.moreMenu}>
              <button
                ref={moreButtonRef}
                type="button"
                aria-expanded={moreOpen}
                aria-controls={morePanelId}
                className={moreIsActive ? styles.navLinkActive : styles.navLink}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <FiMoreHorizontal aria-hidden="true" />
                <span>More</span>
                <FiChevronDown aria-hidden="true" />
              </button>
              {moreOpen ? (
                <div id={morePanelId} className={styles.morePanel}>
                  {secondaryNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={activeForPath(pathname, item) ? "page" : undefined}
                      className={activeForPath(pathname, item) ? styles.moreLinkActive : styles.moreLink}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
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
              <Avatar name={user.name} src={avatarPreview ?? user.avatarUrl} size="md" className={homeStyles.homeProfileAvatar} />
            </button>
            {accountOpen ? (
              <div id={accountPanelId} className={styles.accountPanel}>
                <div className={styles.accountHeader}>
                  <Avatar name={user.name} src={avatarPreview ?? user.avatarUrl} size="sm" />
                  <div className={styles.accountInfo}>
                    <strong>{user.name}</strong>
                    <small>{user.email ?? "Candidate account"}</small>
                  </div>
                </div>
                <div className={styles.accountDivider} />
                <Link href="/profile" onClick={() => setAccountOpen(false)}>View profile</Link>
                <Link href="/dashboard/settings" onClick={() => setAccountOpen(false)}>Settings</Link>
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
              <Avatar name={user.name} src={avatarPreview ?? user.avatarUrl} size="sm" className={homeStyles.homeProfileAvatar} />
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
              onClick={() => setMobileOpen((open) => !open)}
              className={homeStyles.homeMenuButton}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d={mobileOpen ? "M6 6l12 12M18 6 6 18" : "M4 8h16M4 16h16"} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div id={mobileNavId} className={homeStyles.homeMobilePanel}>
            <nav aria-label="Candidate navigation" className={homeStyles.homeMobileNav}>
              {candidateNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={activeForPath(pathname, item) ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={activeForPath(pathname, item) ? styles.mobileActiveLink : undefined}
                >
                  {item.label}
                </Link>
              ))}
              <div className={styles.mobileDivider} />
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className={`${homeStyles.homeMobileLogin} ${homeStyles.homeMobileAccount}`}
              >
                <span className={homeStyles.homeMobileAccountIdentity}>
                  <Avatar src={avatarPreview ?? user.avatarUrl} name={user.name} size="sm" />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email ?? "Candidate account"}</small>
                  </span>
                </span>
                <span aria-hidden="true">👤</span>
              </Link>
              <Link href="/dashboard/settings" onClick={() => setMobileOpen(false)}>Settings</Link>
              <button type="button" onClick={onLogout} className={styles.mobileLogoutButton}>
                Log out <span aria-hidden="true">→</span>
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      <CandidateAvatarPreviewContext.Provider value={setAvatarPreview}>
        <main id="candidate-content" className={styles.content}>{children}</main>
      </CandidateAvatarPreviewContext.Provider>
      <SupportButton />
    </div>
  );
}
