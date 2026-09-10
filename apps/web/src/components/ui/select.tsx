"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helper, error, required, id, className, children, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `ct-select-${autoId}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helper && !error ? `${inputId}-helper` : undefined;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label} {required ? <span aria-hidden className="text-danger">*</span> : null}
        </label>
      ) : null}
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[helperId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-11 w-full appearance-none rounded-lg border bg-surface px-3.5 pr-9 text-[15px] text-foreground",
          "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717A%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.75rem_center] bg-no-repeat",
          "transition-colors duration-fast ease-standard",
          error
            ? "border-danger focus:border-danger focus:ring-2 focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20",
          "focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-secondary",
          className
        )}
        {...props}
      >
        {children}
      </select>
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
