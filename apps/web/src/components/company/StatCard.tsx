"use client";

import React from "react";
import { IconType } from "react-icons";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: IconType;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  highlight?: boolean;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  highlight = false,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border border-border-subtle bg-surface p-5 transition-colors duration-fast ${
        highlight
          ? "border-border-strong shadow-sm"
          : "hover:border-border-strong"
      } ${onClick ? "cursor-pointer hover:shadow-md" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-foreground leading-none">
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              trend.isPositive
                ? "text-success"
                : "text-muted-foreground"
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subValue && (
        <p className="mt-1.5 text-xs text-muted-foreground font-medium">{subValue}</p>
      )}
    </div>
  );
}
