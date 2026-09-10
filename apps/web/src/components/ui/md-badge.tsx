import type { HTMLAttributes } from "react";

import { Badge, type BadgeVariant } from "./badge";

/** @deprecated Use `Badge` from `@/components/ui/badge`. Compat wrapper. */

type MdBadgeVariant = "default" | "muted" | "live" | "success";

interface MdBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: MdBadgeVariant;
  pulse?: boolean;
}

const variantMap: Record<MdBadgeVariant, BadgeVariant> = {
  default: "neutral",
  muted: "neutral",
  live: "info",
  success: "success",
};

export function MdBadge({
  className,
  children,
  variant = "default",
  pulse = false,
  ...props
}: MdBadgeProps) {
  return (
    <Badge variant={variantMap[variant]} dot={pulse} className={className} {...props}>
      {children}
    </Badge>
  );
}