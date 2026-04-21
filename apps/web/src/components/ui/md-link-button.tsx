import Link from "next/link";
import type { ComponentProps } from "react";

import {
  getMdButtonClasses,
  type MdButtonSize,
  type MdButtonVariant,
} from "@/components/ui/md-button";

type LinkProps = ComponentProps<typeof Link>;

interface MdLinkButtonProps extends Omit<LinkProps, "className"> {
  className?: string;
  variant?: MdButtonVariant;
  size?: MdButtonSize;
}

export function MdLinkButton({
  className,
  variant = "filled",
  size = "md",
  ...props
}: MdLinkButtonProps) {
  return <Link className={getMdButtonClasses({ variant, size, className })} {...props} />;
}