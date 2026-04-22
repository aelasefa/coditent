import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type MdBadgeVariant = "default" | "muted" | "live" | "success";

interface MdBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: MdBadgeVariant;
  pulse?: boolean;
}

const variantClasses: Record<MdBadgeVariant, string> = {
  default: "border-md-outline/55 bg-md-secondaryContainer/70 text-md-onSecondaryContainer",
  muted: "border-md-outline/50 bg-md-surfaceLow/65 text-md-onSurfaceVariant",
  live: "border-fuchsia-300/35 bg-fuchsia-300/15 text-fuchsia-100",
  success: "border-emerald-300/35 bg-emerald-300/15 text-emerald-100",
};

export function MdBadge({
  className,
  children,
  variant = "default",
  pulse = false,
  ...props
}: MdBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.11em]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {pulse ? <span aria-hidden className="md-breathe inline-block h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}