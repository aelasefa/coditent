import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { Button } from "./button";

/** @deprecated Use `Button` from `@/components/ui/button`. Kept as compat wrapper. */

export type MdButtonVariant =
  | "primary"
  | "secondary"
  | "filled"
  | "tonal"
  | "outlined"
  | "ghost"
  | "fab";
export type MdButtonSize = "sm" | "md" | "lg" | "icon";

interface MdButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MdButtonVariant;
  size?: MdButtonSize;
  loading?: boolean;
}

const variantMap: Record<MdButtonVariant, "primary" | "secondary" | "outline" | "ghost"> = {
  primary: "primary",
  filled: "primary",
  secondary: "secondary",
  tonal: "secondary",
  outlined: "outline",
  ghost: "ghost",
  fab: "primary",
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
  // Compat: return semantic class fragment, real render goes through Button.
  return cn(variantMap[variant], size, className);
}

export function MdButton({
  className,
  variant = "filled",
  size = "md",
  type = "button",
  loading,
  ...props
}: MdButtonProps) {
  if (size === "icon") {
    return (
      <Button
        variant={variantMap[variant]}
        size="md"
        loading={loading}
        type={type}
        className={cn("!h-10 !w-10 !px-0", variant === "fab" && "!h-14 !w-14 !rounded-2xl", className)}
        {...props}
      />
    );
  }
  return (
    <Button
      variant={variantMap[variant]}
      size={size === "sm" ? "sm" : size === "lg" ? "lg" : "md"}
      loading={loading}
      type={type}
      className={cn(variant === "fab" && "!h-14 !w-14 !rounded-2xl !px-0", className)}
      {...props}
    />
  );
}
