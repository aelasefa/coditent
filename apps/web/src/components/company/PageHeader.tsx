"use client";

import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span>/</span>}
                {bc.href ? (
                  <a
                    href={bc.href}
                    className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    {bc.label}
                  </a>
                ) : (
                  <span className="text-zinc-900 dark:text-zinc-100">{bc.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-[26px]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          {actions}
        </div>
      )}
    </div>
  );
}
