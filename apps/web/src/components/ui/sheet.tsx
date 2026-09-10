"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";
import { FiX } from "react-icons/fi";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left" | "bottom";
  size?: "sm" | "md" | "lg";
}

const widths: Record<string, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Sheet({ open, onClose, title, description, children, footer, side = "right", size = "md" }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden onClick={onClose} className="fixed inset-0 bg-[var(--overlay)]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={side === "bottom" ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
        className={cn(
          "fixed flex flex-col border bg-surface text-foreground shadow-lg focus:outline-none",
          side === "right" && `inset-y-0 right-0 w-screen ${widths[size]} max-w-full border-l border-border`,
          side === "left" && `inset-y-0 left-0 w-screen ${widths[size]} max-w-full border-r border-border`,
          side === "bottom" && "inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t border-border"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
          </div>
          <IconButton label="Close panel" onClick={onClose}>
            <FiX />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-border-subtle bg-surface-secondary/60 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  ) as unknown as JSX.Element;
}
