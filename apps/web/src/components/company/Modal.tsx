"use client";

import React from "react";
import { Dialog } from "@/components/ui/dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const sizeMap = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
  "2xl": "xl",
} as const;

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "lg",
}: ModalProps) {
  // Compat wrapper around canonical Dialog. Preserves API.
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={title}
      description={subtitle}
      footer={footer}
      size={sizeMap[maxWidth]}
    >
      {children}
    </Dialog>
  );
}
