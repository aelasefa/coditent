import { cn } from "@/lib/cn";

interface SkeletonProps {
  variant?: "text" | "circle" | "rect";
  className?: string;
}

export function Skeleton({ variant = "rect", className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse bg-surface-secondary motion-reduce:animate-none",
        variant === "text" && "h-4 rounded",
        variant === "circle" && "rounded-full",
        variant === "rect" && "rounded-lg",
        className
      )}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden aria-label="Loading" role="status" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}
