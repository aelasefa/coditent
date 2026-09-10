"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { isNavActive, type NavItem, type NavSection } from "./nav-config";

interface ShellUser {
  name: string;
  email?: string;
  roleLabel?: string;
}

interface AppShellProps {
  navSections: NavSection[];
  bottomNav?: NavItem[];
  user: ShellUser;
  logoHref: string;
  workspaceCard?: React.ReactNode;
  searchSlot?: React.ReactNode;
  notificationSlot?: React.ReactNode;
  topbarAction?: React.ReactNode;
  userMenuItems?: Array<{ label: string; href: string }>;
  onLogout: () => void;
  children: React.ReactNode;
}

function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-3.5 py-4">
      {sections.map((section, si) => (
        <div key={section.title ?? `section-${si}`} className="space-y-1">
          {section.title ? (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = isNavActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-fast",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span>{item.label}</span>
                {active ? <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ user, menuItems, onLogout }: { user: ShellUser; menuItems: Array<{ label: string; href: string }>; onLogout: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border-subtle bg-surface-secondary/50 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface-secondary"
      >
        <Avatar name={user.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">{user.name}</span>
          {user.email ? <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span> : null}
        </span>
      </button>
      {open ? (
        <div className="mt-1 space-y-1 rounded-lg border border-border-subtle bg-surface p-1.5 shadow-md">
          {menuItems.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-1.5 text-xs text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"
            >
              {m.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
              router.refresh?.();
            }}
            className="block w-full rounded-md px-3 py-1.5 text-left text-xs font-medium text-danger hover:bg-danger-background"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  navSections,
  bottomNav,
  user,
  logoHref,
  workspaceCard,
  searchSlot,
  notificationSlot,
  topbarAction,
  userMenuItems = [],
  onLogout,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-screen flex-1">
        <aside className="fixed inset-y-0 z-30 hidden w-60 flex-col border-r border-border-subtle bg-surface md:flex lg:w-64">
          <div className="border-b border-border-subtle px-5 py-4">
            <Link href={logoHref} aria-label="Coditent home" className="inline-flex">
              <Logo size="md" />
            </Link>
            {workspaceCard}
          </div>
          <SidebarNav sections={navSections} />
          <UserFooter user={user} menuItems={userMenuItems} onLogout={onLogout} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:pl-60 lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-foreground-secondary hover:bg-surface-secondary md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <Link href={logoHref} aria-label="Coditent home" className="md:hidden">
              <Logo variant="mark" size="sm" />
            </Link>
            {searchSlot ? <div className="min-w-0 flex-1">{searchSlot}</div> : <div className="flex-1" />}
            <div className="flex shrink-0 items-center gap-1.5">
              {topbarAction}
              {notificationSlot}
            </div>
          </header>

          <main className={cn("flex-1", bottomNav && "pb-20 md:pb-0")}>{children}</main>
        </div>
      </div>

      {bottomNav ? (
        <nav
          aria-label="Primary mobile"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur-md md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="grid grid-cols-5">
            {bottomNav.map((item) => {
              const active = isNavActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      <Sheet
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="Navigation"
        side="left"
        size="sm"
      >
        <div className="flex h-full flex-col">
          <Link href={logoHref} onClick={() => setMobileOpen(false)} aria-label="Coditent home">
            <Logo size="md" />
          </Link>
          {workspaceCard ? <div className="mt-3">{workspaceCard}</div> : null}
          <div className="mt-2 flex-1 overflow-y-auto">
            <SidebarNav sections={navSections} onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-background"
            >
              Log out
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
