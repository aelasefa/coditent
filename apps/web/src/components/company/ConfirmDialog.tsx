"use client";

import React from "react";
import { Modal } from "./Modal";
import { FiAlertTriangle } from "react-icons/fi";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  isDestructive = true,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
              isDestructive
                ? "bg-rose-600 hover:bg-rose-700 shadow-sm shadow-rose-900/30"
                : "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
            }`}
          >
            {isLoading ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {isDestructive && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50">
            <FiAlertTriangle className="h-5 w-5" />
          </div>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pt-0.5">{message}</p>
      </div>
    </Modal>
  );
}
