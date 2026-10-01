"use client";

import React from "react";
import { Sheet } from "@/components/ui/sheet";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerLeading?: React.ReactNode;
  headerMeta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  panelClassName?: string;
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
  headerLeading,
  headerMeta,
  children,
  footer,
  width = "md",
  panelClassName,
}: DrawerProps) {
  // Compat wrapper around canonical Sheet. Preserves API.
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={title}
      description={subtitle}
      headerLeading={headerLeading}
      headerMeta={headerMeta}
      footer={footer}
      side="right"
      size={sizeMap[width]}
      panelClassName={panelClassName}
    >
      {children}
    </Sheet>
  );
}
