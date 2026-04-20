import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type MdButtonVariant = "filled" | "tonal" | "outlined" | "ghost" | "fab";
type MdButtonSize = "sm" | "md" | "lg" | "icon";

interface MdButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MdButtonVariant;
  size?: MdButtonSize;
}

const variantClasses: Record<MdButtonVariant, string> = {
  filled:
    "bg-md-primary text-md-onPrimary shadow-md-sm hover:bg-md-primary/90 hover:shadow-md-md active:bg-md-primary/80",
  tonal:
    "bg-md-secondaryContainer text-md-onSecondaryContainer shadow-md-sm hover:bg-md-secondaryContainer/90 hover:shadow-md-md active:bg-md-secondaryContainer/80",
  outlined:
    "border border-md-outline/70 text-md-primary hover:bg-md-primary/10 active:bg-md-primary/5",
  ghost: "text-md-primary hover:bg-md-primary/10 active:bg-md-primary/5",
  fab:
    "h-14 w-14 rounded-md-xl bg-md-tertiary px-0 text-white shadow-md-md hover:bg-md-tertiary/90 hover:shadow-md-lg active:bg-md-tertiary/80",
};

const sizeClasses: Record<MdButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-10 px-6 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10 px-0 text-base",
};

export function MdButton({
  className,
  variant = "filled",
  size = "md",
  type = "button",
  ...props
}: MdButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em]",
        "transition-all duration-300 ease-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 focus-visible:ring-offset-md-background",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        "active:scale-95",
        variantClasses[variant],
        variant !== "fab" && sizeClasses[size],
        className
      )}
      type={type}
      {...props}
    />
  );
}
