"use client";

import React from "react";
import { IconType } from "react-icons";

interface EmptyStateProps {
  icon?: IconType;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 shadow-sm">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction && (
            primaryAction.href ? (
              <a
                href={primaryAction.href}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                {primaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                {primaryAction.label}
              </button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
