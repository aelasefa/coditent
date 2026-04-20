import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
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

export function MdInput({ className, ...props }: MdInputProps) {
  return (
    <input
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
}

type MdTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function MdTextArea({ className, ...props }: MdTextAreaProps) {
  return (
    <textarea
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
}

type MdSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function MdSelect({ className, children, ...props }: MdSelectProps) {
  return (
    <select
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
}
