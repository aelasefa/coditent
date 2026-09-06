"use client";

import React, { useEffect } from "react";
import { FiX } from "react-icons/fi";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const widthMap = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div
          role="dialog"
          aria-modal="true"
          className={`w-screen ${widthMap[width]} bg-white dark:bg-[#121215] shadow-2xl border-l border-zinc-200 dark:border-zinc-800 flex flex-col text-zinc-900 dark:text-zinc-100`}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              aria-label="Close panel"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 text-zinc-800 dark:text-zinc-200">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
