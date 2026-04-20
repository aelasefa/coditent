import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface MdCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function MdCard({ className, interactive = false, ...props }: MdCardProps) {
  return (
    <div
      className={cn(
        "rounded-md-lg border border-md-outline/20 bg-md-surface text-md-foreground shadow-md-sm",
        "transition-all duration-300 ease-md",
        interactive && "hover:scale-[1.02] hover:shadow-md-md",
        className
      )}
      {...props}
    />
  );
}
