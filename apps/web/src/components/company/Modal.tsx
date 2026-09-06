"use client";

import React, { useEffect } from "react";
import { FiX } from "react-icons/fi";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "lg",
}: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
        className={`relative z-10 w-full ${maxWidthMap[maxWidth]} rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] shadow-xl transition-all`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
          <div>
            <h3
              id="modal-headline"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight"
            >
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(85vh-140px)] overflow-y-auto px-6 py-5 text-zinc-800 dark:text-zinc-200">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-3.5 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
