import { cn } from "@/lib/cn";

import { MdBadge } from "@/components/ui/md-badge";

type ActivityStatus = "live" | "completed" | "queued";

interface ActivityItemProps {
  message: string;
  timeLabel: string;
  status: ActivityStatus;
  className?: string;
}

const statusMap: Record<ActivityStatus, { badge: "live" | "success" | "muted"; label: string }> = {
  live: { badge: "live", label: "Live" },
  completed: { badge: "success", label: "Done" },
  queued: { badge: "muted", label: "Queued" },
};

export function ActivityItem({ message, timeLabel, status, className }: ActivityItemProps) {
  const meta = statusMap[status];

  return (
    <li
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors duration-200 ease-md hover:bg-white/[0.03]",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 inline-block h-2 w-2 rounded-full",
          status === "live" ? "md-breathe bg-fuchsia-300" : "bg-md-primary"
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm text-md-foreground/95">{message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <time className="text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">{timeLabel}</time>
          <MdBadge variant={meta.badge}>{meta.label}</MdBadge>
        </div>
      </div>
    </li>
  );
}