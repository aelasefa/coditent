"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";
import { FiX } from "react-icons/fi";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissOnOverlayClick?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "lg",
  dismissOnOverlayClick = true,
  initialFocusRef,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      if (initialFocusRef?.current) initialFocusRef.current.focus();
      else {
        const items = panelRef.current ? focusable(panelRef.current) : [];
        (items[0] ?? panelRef.current)?.focus();
      }
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const items = focusable(panelRef.current);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden
        onClick={dismissOnOverlayClick ? onClose : undefined}
        className="fixed inset-0 bg-[var(--overlay)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[85vh] w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface text-foreground shadow-lg",
          "animate-[ct-dialog-in_var(--duration-normal)_var(--ease-standard)] motion-reduce:animate-none",
          sizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold leading-tight">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-[13px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <FiX />
          </IconButton>
        </div>
        <div className="max-h-[calc(85vh-140px)] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2.5 rounded-b-2xl border-t border-border-subtle bg-surface-secondary/60 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`@keyframes ct-dialog-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>,
    document.body
  ) as unknown as JSX.Element;
}
