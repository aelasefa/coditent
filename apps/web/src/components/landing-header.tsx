"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { MdBadge } from "@/components/ui/md-badge";
import { MdLinkButton } from "@/components/ui/md-link-button";

type NavItem = {
  label: string;
  href: string;
};

interface LandingHeaderProps {
  navItems: NavItem[];
}

export function LandingHeader({ navItems }: LandingHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-4 z-20 rounded-full border px-4 py-3 transition-all duration-200 ease-md sm:px-6",
        isScrolled
          ? "border-white/15 bg-md-surface/82 shadow-md-md backdrop-blur-xl"
          : "border-md-outline/60 bg-md-surface/62 shadow-md-sm backdrop-blur-md"
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <Link
          className="inline-flex items-center gap-3 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary"
          href="/"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-md-primary text-sm font-medium text-md-onPrimary">
            C
          </span>
          <span className="text-sm font-medium tracking-wide">Coditent</span>
          <span className="hidden sm:inline-flex">
            <MdBadge pulse variant="live">
              Live
            </MdBadge>
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-md-onSurfaceVariant md:flex">
          {navItems.map((item) => (
            <Link
              className="rounded-full px-2 py-1 transition-colors duration-200 ease-md hover:text-md-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <MdLinkButton href="/login" size="sm" variant="ghost">
            Login
          </MdLinkButton>
          <MdLinkButton href="/register" size="sm" variant="primary">
            Register
          </MdLinkButton>
        </div>
      </div>
    </header>
  );
}