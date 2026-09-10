import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { Card } from "./card";

/** @deprecated Use `Card` from `@/components/ui/card`. Compat wrapper. */

interface MdCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  variant?: "default" | "elevated" | "interactive" | "ghost";
}

export function MdCard({ className, interactive = false, variant = "default", ...props }: MdCardProps) {
  const hover = interactive || variant === "interactive";
  return (
    <Card
      className={cn(
        hover && "transition-all duration-normal ease-standard hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
        variant === "ghost" && "bg-surface-secondary/60",
        className
      )}
      {...props}
    />
  );
}
