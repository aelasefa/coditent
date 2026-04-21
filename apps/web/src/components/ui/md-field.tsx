import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

interface MdFieldProps {
  label: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function MdField({ label, error, hint, htmlFor, children }: MdFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-md-onSurfaceVariant" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-md-onSurfaceVariant/80">{hint}</p> : null}
    </div>
  );
}

type MdInputProps = InputHTMLAttributes<HTMLInputElement>;

export const MdInput = forwardRef<HTMLInputElement, MdInputProps>(function MdInput(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-14 w-full rounded-t-md-sm rounded-b-none border-0 border-b-2 border-md-outline/70 bg-md-surfaceLow px-4",
        "text-sm text-md-foreground placeholder:text-md-onSurfaceVariant/70",
        "transition-all duration-200 ease-md",
        "focus:border-md-primary focus:outline-none focus:ring-2 focus:ring-md-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

type MdTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const MdTextArea = forwardRef<HTMLTextAreaElement, MdTextAreaProps>(function MdTextArea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-t-md-sm rounded-b-none border-0 border-b-2 border-md-outline/70 bg-md-surfaceLow px-4 py-3",
        "text-sm text-md-foreground placeholder:text-md-onSurfaceVariant/70",
        "transition-all duration-200 ease-md",
        "focus:border-md-primary focus:outline-none focus:ring-2 focus:ring-md-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

type MdSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const MdSelect = forwardRef<HTMLSelectElement, MdSelectProps>(function MdSelect(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-14 w-full rounded-t-md-sm rounded-b-none border-0 border-b-2 border-md-outline/70 bg-md-surfaceLow px-4",
        "text-sm text-md-foreground",
        "transition-all duration-200 ease-md",
        "focus:border-md-primary focus:outline-none focus:ring-2 focus:ring-md-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
