import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  outline?: boolean;
  dot?: boolean;
}

const solid: Record<BadgeVariant, string> = {
  neutral: "bg-surface-secondary text-foreground-secondary",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-background text-success",
  warning: "bg-warning-background text-warning",
  danger: "bg-danger-background text-danger",
  info: "bg-info-background text-info",
};

export function Badge({ variant = "neutral", outline = false, dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        "border",
        outline ? "bg-transparent" : "border-transparent",
        outline ? "border-current" : "",
        solid[variant],
        className
      )}
      {...props}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
