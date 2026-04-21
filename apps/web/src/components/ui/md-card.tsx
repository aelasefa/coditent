import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface MdCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  variant?: "default" | "elevated" | "interactive" | "ghost";
}

const variantClasses: Record<NonNullable<MdCardProps["variant"]>, string> = {
  default: "border-md-outline/40 bg-md-surface/66 shadow-md-sm backdrop-blur-md",
  elevated: "border-md-outline/45 bg-md-surface/78 shadow-md-md backdrop-blur-lg",
  interactive:
    "border-md-outline/45 bg-md-surface/74 shadow-md-sm backdrop-blur-md hover:-translate-y-1 hover:shadow-md-lg",
  ghost: "border-md-outline/30 bg-md-surfaceLow/54 shadow-none backdrop-blur-sm",
};

export function MdCard({ className, interactive = false, variant = "default", ...props }: MdCardProps) {
  const resolvedVariant = interactive && variant === "default" ? "interactive" : variant;

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-md-lg border text-md-foreground",
        "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-md",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.1),transparent_48%)] before:opacity-70",
        "focus-within:border-md-primary/60 focus-within:shadow-md-md",
        variantClasses[resolvedVariant],
        className
      )}
      {...props}
    />
  );
}
