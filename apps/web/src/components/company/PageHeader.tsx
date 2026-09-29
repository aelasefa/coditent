"use client";

import React from "react";
import { PageHeader as ShellHeader } from "@/components/shell/page-container";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  tone?: "soft" | "dark";
  variant?: "hero" | "plain";
  center?: boolean;
  icon?: React.ReactNode;
  eyebrow?: string;
}

// Compat wrapper around shell PageHeader. Preserves API, uses tokens.
export function PageHeader({ title, subtitle, badge, actions, breadcrumbs, tone = "soft", variant = "hero", center = false, icon, eyebrow }: PageHeaderProps) {
  const content = (
    <>
      {eyebrow ? <p className="company-hero-eyebrow">{eyebrow}</p> : null}
      {icon ? <div className="company-hero-icon" aria-hidden="true">{icon}</div> : null}
    <ShellHeader
      title={title}
      description={subtitle}
      actions={
        <>
          {badge}
          {actions}
        </>
      }
      breadcrumbs={
        breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span aria-hidden>/</span>}
                {bc.href ? (
                  <a href={bc.href} className="hover:text-foreground">
                    {bc.label}
                  </a>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {bc.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        ) : undefined
      }
    />
    </>
  );
  return variant === "plain" ? content : <section className={`company-page-hero ${tone === "dark" ? "company-page-hero-dark" : ""} ${center ? "company-page-hero-center" : ""}`}>{content}</section>;
}
