"use client";

import React from "react";
import { IconType } from "react-icons";
import { EmptyState as CanonicalEmptyState } from "@/components/ui/empty-state";

interface EmptyStateProps {
  icon?: IconType;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export function EmptyState(props: EmptyStateProps) {
  // Compat wrapper around canonical EmptyState. Preserves API.
  return <CanonicalEmptyState {...props} />;
}
