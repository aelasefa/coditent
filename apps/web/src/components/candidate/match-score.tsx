"use client";

import { cn } from "@/lib/cn";

export type MatchState = "scored" | "pending" | "unavailable" | "failed";

export function getMatchState(score: number | null | undefined, reasoning?: string | null): MatchState {
  if (typeof score === "number" && score > 0) return "scored";
  const text = (reasoning ?? "").toLowerCase();
  if (text.includes("en attente") || text.includes("pending") || text.includes("in progress")) return "pending";
  if (score === 0 && reasoning) return "pending";
  if (typeof score === "number") return "unavailable";
  return "unavailable";
}

export function MatchScore({ score, reasoning }: { score?: number | null; reasoning?: string | null }) {
  const state = getMatchState(score, reasoning);
  if (state === "scored") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5L8 13.8 2 9.2h7.6z" />
        </svg>
        <span>
          {score}% match <span className="sr-only">(AI match analysis)</span>
        </span>
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        Match analysis pending
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Match unavailable
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-muted-foreground")}>
      No match data
    </span>
  );
}
