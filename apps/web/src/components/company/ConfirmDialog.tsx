"use client";

import { Modal } from "./Modal";
import { Button } from "@/components/ui/button";
import { FiAlertTriangle } from "react-icons/fi";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
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
      maxWidth="md"
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
      <div className="flex items-start gap-3.5">
        {isDestructive && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger-background text-danger" aria-hidden>
            <FiAlertTriangle className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-foreground-secondary">{message}</div>
      </div>
    </Modal>
  );
}
