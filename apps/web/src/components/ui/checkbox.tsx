"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, error, id, className, ...props },
  ref
) {
  const errorId = error ? `${id ?? "ct-checkbox"}-error` : undefined;
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={errorId}
          className={cn(
            "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[6px] border border-border-strong bg-surface",
            "transition-colors duration-fast",
            "checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%3E%3Cpath%20d%3D%22M20%206%209%2017l-5-5%22%2F%3E%3C%2Fsvg%3E')] checked:bg-center checked:bg-no-repeat",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
          {...props}
        />
        <span>
          <span className="block text-sm font-medium text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
