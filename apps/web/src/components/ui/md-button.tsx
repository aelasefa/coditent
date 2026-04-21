import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type MdButtonVariant =
  | "primary"
  | "secondary"
  | "filled"
  | "tonal"
  | "outlined"
  | "ghost"
  | "fab";
export type MdButtonSize = "sm" | "md" | "lg" | "icon";

type CanonicalVariant = "primary" | "secondary" | "outlined" | "ghost" | "fab";

interface MdButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MdButtonVariant;
  size?: MdButtonSize;
}

const variantAlias: Record<MdButtonVariant, CanonicalVariant> = {
  primary: "primary",
  filled: "primary",
  secondary: "secondary",
  tonal: "secondary",
  outlined: "outlined",
  ghost: "ghost",
  fab: "fab",
};

const variantClasses: Record<CanonicalVariant, string> = {
  primary:
    "bg-[linear-gradient(135deg,#8f75c7_0%,#6e57ad_100%)] text-md-onPrimary shadow-md-md hover:scale-[1.03] hover:shadow-md-lg active:scale-[0.98]",
  secondary:
    "border border-md-outline/70 bg-md-secondaryContainer/80 text-md-onSecondaryContainer shadow-md-sm hover:scale-[1.02] hover:bg-md-secondaryContainer/95 hover:shadow-md-md active:scale-[0.99]",
  outlined:
    "border border-md-outline/75 bg-md-surface/45 text-md-primary shadow-none hover:scale-[1.02] hover:bg-md-primary/12 active:scale-[0.99]",
  ghost:
    "border border-transparent bg-transparent text-md-onSurfaceVariant shadow-none hover:scale-[1.02] hover:border-md-outline/45 hover:bg-white/5 hover:text-md-foreground active:scale-[0.99]",
  fab:
    "h-14 w-14 rounded-md-xl bg-md-tertiary px-0 text-white shadow-md-md hover:scale-[1.04] hover:bg-md-tertiary/92 hover:shadow-md-lg active:scale-[0.98]",
};

const sizeClasses: Record<MdButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-10 px-6 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10 px-0 text-base",
};

export function getMdButtonClasses({
  variant = "filled",
  size = "md",
  className,
}: {
  variant?: MdButtonVariant;
  size?: MdButtonSize;
  className?: string;
}): string {
  const canonicalVariant = variantAlias[variant];

  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em]",
    "transition-[transform,box-shadow,background-color,opacity,color,border-color] duration-200 ease-md",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 focus-visible:ring-offset-md-background",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:transform-none",
    variantClasses[canonicalVariant],
    canonicalVariant !== "fab" && sizeClasses[size],
    className
  );
}

export function MdButton({
  className,
  variant = "filled",
  size = "md",
  type = "button",
  ...props
}: MdButtonProps) {
  return (
    <button
      className={getMdButtonClasses({ variant, size, className })}
      type={type}
      {...props}
    />
  );
}
