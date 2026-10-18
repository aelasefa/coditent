import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import styles from "./loading-spinner.module.css";

export type LoadingSpinnerSize = "small" | "medium" | "large";
export type LoadingSpinnerPlacement = "inline" | "center" | "page";
export type LoadingSpinnerTone = "brand" | "current";

interface LoadingSpinnerProps extends Omit<ComponentPropsWithoutRef<"span">, "children" | "role" | "aria-label"> {
  size?: LoadingSpinnerSize;
  placement?: LoadingSpinnerPlacement;
  tone?: LoadingSpinnerTone;
  label?: string;
  announce?: boolean;
}

export function LoadingSpinner({
  size = "medium",
  placement = "inline",
  tone = "brand",
  label = "Loading",
  announce = true,
  className,
  ...props
}: LoadingSpinnerProps) {
  return (
    <span
      {...props}
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy={announce ? true : undefined}
      aria-hidden={announce ? undefined : true}
      className={cn(styles.root, styles[size], styles[placement], styles[tone], className)}
    >
      <span className={styles.ring} aria-hidden="true" />
    </span>
  );
}
