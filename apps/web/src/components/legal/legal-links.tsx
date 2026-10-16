import Link from "next/link";
import { cn } from "@/lib/cn";

export function LegalLinks({
  className,
  currentPath,
  layout = "row",
  onNavigate,
}: {
  className?: string;
  currentPath?: "/privacy" | "/terms";
  layout?: "row" | "column";
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Legal"
      className={cn(
        "flex text-sm text-foreground-secondary",
        layout === "column" ? "flex-col items-stretch" : "flex-wrap items-center gap-x-5 gap-y-2",
        className,
      )}
    >
      {[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms of Service" },
      ].map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={currentPath === href ? "page" : undefined}
          onClick={onNavigate}
          className="rounded-sm py-1 underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
