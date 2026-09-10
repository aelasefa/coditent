"use client";

import type { ComponentType } from "react";
import { Button } from "./button";

interface EmptyAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  primaryAction?: EmptyAction;
  secondaryAction?: EmptyAction;
}

export function EmptyState({ icon: Icon, title, description, primaryAction, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      {Icon ? (
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-secondary text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction ? (
            primaryAction.href ? (
              <a href={primaryAction.href} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
                {primaryAction.label}
              </a>
            ) : (
              <Button size="sm" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            )
          ) : null}
          {secondaryAction ? (
            secondaryAction.href ? (
              <a href={secondaryAction.href} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-[13px] font-medium text-foreground hover:bg-surface-secondary">
                {secondaryAction.label}
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
