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
      className={`relative rounded-xl border p-5 transition-all duration-150 ${
        highlight
          ? "bg-white dark:bg-[#121215] border-zinc-900 dark:border-zinc-100 shadow-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10"
          : "bg-white dark:bg-[#121215] border-zinc-200/90 dark:border-zinc-800/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-zinc-300 dark:hover:border-zinc-700"
      } ${onClick ? "cursor-pointer hover:shadow-md" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-750 text-zinc-600 dark:text-zinc-300">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              trend.isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subValue && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">{subValue}</p>
      )}
    </div>
  );
}
