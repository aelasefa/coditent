"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, required, id, disabled, className, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `ct-input-${autoId}`;
  const helperId = helper && !error ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label} {required ? <span aria-hidden className="text-danger">*</span> : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[helperId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-11 w-full rounded-lg border bg-surface px-3.5 text-[15px] text-foreground",
          "placeholder:text-muted-foreground/70",
          "transition-colors duration-fast ease-standard",
          error
            ? "border-danger focus:border-danger focus:ring-2 focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20",
          "focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-secondary",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="text-[13px] text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
});
