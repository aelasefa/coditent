"use client";

import React from "react";
import { Sheet } from "@/components/ui/sheet";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "lg",
} as const;

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: DrawerProps) {
  // Compat wrapper around canonical Sheet. Preserves API.
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={title}
      description={subtitle}
      footer={footer}
      side="right"
      size={sizeMap[width]}
    >
      {children}
    </Sheet>
  );
}
