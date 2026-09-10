import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

/** @deprecated Use `Input`/`Textarea`/`Select` from `@/components/ui`. Compat wrapper kept. */

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
      <label className="block text-sm font-medium text-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const fieldInputBase = cn(
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5",
  "text-[15px] text-foreground placeholder:text-muted-foreground/70",
  "transition-colors duration-fast ease-standard",
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-secondary"
);

type MdInputProps = InputHTMLAttributes<HTMLInputElement>;

export const MdInput = forwardRef<HTMLInputElement, MdInputProps>(function MdInput(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(fieldInputBase, className)}
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
      className={cn(fieldInputBase, "min-h-28 h-auto py-3", className)}
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
      className={cn(fieldInputBase, className)}
      {...props}
    >
      {children}
    </select>
  );
});
