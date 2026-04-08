"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getMe } from "@/lib/api";
import { LogoutButton } from "@/components/logout-button";
import type { User } from "@/lib/types";

function roleBadge(role?: string) {
  if (role === "RECRUITER") {
    return "bg-sky-100 text-sky-700";
  }

  return "bg-emerald-100 text-emerald-700";
}

export function AppNavbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then((data) => {
        if (isMounted) {
          setUser(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const navLinkClass = (href: string) =>
    `rounded-full px-3 py-1.5 text-sm transition ${
      pathname.startsWith(href)
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Coditent
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link className={navLinkClass("/dashboard")} href="/dashboard">
              Candidate
            </Link>
            <Link className={navLinkClass("/recruiter")} href="/recruiter">
              Recruiter
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-900">{user?.full_name || "User"}</p>
            <p className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge(user?.role)}`}>
              {user?.role === "RECRUITER" ? "Recruiter" : "Candidate"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
