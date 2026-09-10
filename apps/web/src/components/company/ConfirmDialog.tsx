"use client";

import { Modal } from "./Modal";
import { Button } from "@/components/ui/button";
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
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant={isDestructive ? "danger" : "primary"} onClick={onConfirm} loading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {isDestructive && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger-background text-danger" aria-hidden>
            <FiAlertTriangle className="h-5 w-5" />
          </span>
        )}
        <p className="pt-0.5 text-[13px] leading-relaxed text-foreground-secondary">{message}</p>
      </div>
    </Modal>
  );
}
