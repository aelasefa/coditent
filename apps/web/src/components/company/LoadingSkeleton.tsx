"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonBox({
  className = "",
  animate = true,
}: {
  className?: string;
  animate?: boolean;
}) {
  // Compat wrapper around canonical Skeleton. Preserves API.
  return (
    <Skeleton
      className={`${animate ? "" : "[animation:none]"} ${className}`}
    />
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border-subtle bg-surface p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <SkeletonBox className="h-3 w-20" />
            <SkeletonBox className="h-7 w-7 rounded-lg" />
          </div>
          <SkeletonBox className="h-8 w-16" />
          <SkeletonBox className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      <div className="flex items-center gap-4 border-b border-border-subtle bg-surface-secondary/60 px-5 py-3.5">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBox key={i} className="h-3.5 flex-1 max-w-[120px]" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border-subtle)] p-2 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-3 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonBox
                key={c}
                className={`h-4 flex-1 ${
                  c === 0 ? "max-w-[160px]" : "max-w-[100px]"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
