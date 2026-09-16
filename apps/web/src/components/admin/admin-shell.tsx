"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { PageContainer } from "@/components/shell/page-container";
import { getMe } from "@/lib/api";
import {
  FiActivity,
  FiGrid,
  FiMail,
  FiSettings,
  FiShield,
  FiUsers,
} from "react-icons/fi";

const NAV = [
  { label: "Overview", href: "/admin", icon: FiGrid, exact: true },
  { label: "Companies", href: "/admin/companies", icon: FiShield },
  { label: "Company Invitations", href: "/admin/company-invitations", icon: FiMail },
  { label: "Users", href: "/admin/users", icon: FiUsers },
  { label: "Platform Activity", href: "/admin/activity", icon: FiActivity },
  { label: "Settings", href: "/admin/settings", icon: FiSettings },
];

function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("coditent_token");
    document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/admin/login";
  }
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  const nav = (
    <nav aria-label="Admin" className="flex-1 space-y-1 overflow-y-auto px-3.5 py-4">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-fast",
              active ? "bg-primary/10 text-primary" : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"
            )}
          >
            <Icon aria-hidden className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            <span>{item.label}</span>
            {active && <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-screen flex-1">
        <aside className="fixed inset-y-0 z-30 hidden w-60 flex-col border-r border-border-subtle bg-surface md:flex">
          <div className="border-b border-border-subtle px-5 py-4">
            <Link href="/admin" aria-label="Admin home" className="inline-flex">
              <Logo size="md" />
            </Link>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Platform admin</p>
          </div>
          {nav}
          <div className="border-t border-border-subtle p-3">
            <div className="flex items-center gap-2.5 rounded-lg p-1.5">
              <Avatar name={me?.full_name || me?.email || "Admin"} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{me?.full_name || "Admin"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{me?.email}</span>
              </span>
            </div>
            <button type="button" onClick={logout} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-danger hover:bg-danger-background">
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col md:pl-60">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 backdrop-blur-md">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 hover:bg-surface-secondary md:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <Link href="/admin" aria-label="Admin home" className="md:hidden">
              <Logo variant="mark" size="sm" />
            </Link>
            <span className="text-sm font-semibold">Admin console</span>
          </header>
          <main className="flex-1">
            <PageContainer variant="wide">{children}</PageContainer>
          </main>
        </div>
      </div>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Admin navigation" side="left" size="sm">
        <div className="flex h-full flex-col">
          <Link href="/admin" onClick={() => setMobileOpen(false)} aria-label="Admin home">
            <Logo size="md" />
          </Link>
          <div className="mt-2 flex-1 overflow-y-auto">{nav}</div>
          <button type="button" onClick={logout} className="mt-3 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-background">
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}
