"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";

export interface NextAction {
  icon: ComponentType<{ className?: string }>;
  title: string;
  context: string;
  cta: string;
  href: string;
}

export function NextActionCard({ action }: { action: NextAction }) {
  const Icon = action.icon;
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{action.title}</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{action.context}</span>
          <Link href={action.href} className="mt-2 inline-block text-[13px] font-semibold text-primary hover:underline">
            {action.cta}
          </Link>
        </span>
      </CardContent>
    </Card>
  );
}
