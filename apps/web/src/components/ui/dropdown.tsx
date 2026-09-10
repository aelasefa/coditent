"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface DropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function Dropdown({
  label,
  items,
  align = "right",
}: {
  label: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        id={btnId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-foreground hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={btnId}
          className={cn(
            "absolute z-50 mt-2 min-w-44 overflow-hidden rounded-xl border border-border-subtle bg-surface py-1.5 shadow-md",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-left text-sm text-foreground hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
