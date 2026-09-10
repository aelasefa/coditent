"use client";

import { useId } from "react";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  const tipId = useId();
  return (
    <span className="group relative inline-flex">
      <span aria-describedby={tipId} className="inline-flex">
        {children}
      </span>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-md transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
