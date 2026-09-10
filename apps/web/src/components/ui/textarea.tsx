"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
  maxLength?: number;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helper, error, required, id, maxLength, showCount, value, defaultValue, className, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `ct-textarea-${autoId}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helper && !error ? `${inputId}-helper` : undefined;
  const currentLength = String(value ?? defaultValue ?? "").length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {label ? (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label} {required ? <span aria-hidden className="text-danger">*</span> : null}
          </label>
        ) : (
          <span />
        )}
        {showCount && typeof maxLength === "number" ? (
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {currentLength}/{maxLength}
          </span>
        ) : null}
      </div>
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        maxLength={maxLength}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[helperId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-28 w-full rounded-lg border bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-foreground",
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
