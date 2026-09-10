"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { MatchScore } from "./match-score";
import { formatDate, offerLocation, parseSkills } from "./offer-utils";
import type { Recommendation } from "@/lib/types";

interface JobCardProps {
  rec: Recommendation;
  selected?: boolean;
  applied?: boolean;
  href?: string;
  onSelect?: () => void;
}

export function JobCard({ rec, selected, applied, href, onSelect }: JobCardProps) {
  const offer = rec.offer;
  const score = rec.score ?? rec.ai_score ?? null;
  const reasoning = rec.reasoning ?? rec.ai_reasoning ?? null;
  const skills = parseSkills(offer.required_skills).slice(0, 3);
  const location = offerLocation(offer);
  const posted = formatDate(offer.posted_at);

  const body = (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={offer.company} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{offer.title}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{offer.company}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[location, offer.type === "INTERNSHIP" ? "Internship" : "Job", offer.work_mode].filter(Boolean).join(" · ")}
            {posted ? ` · ${posted}` : ""}
          </p>
        </div>
        <MatchScore score={score} reasoning={reasoning} />
      </div>
      {skills.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-foreground-secondary">
              {s}
            </span>
          ))}
        </div>
      ) : null}
      {applied ? (
        <p className="mt-2 text-xs font-semibold text-success">Applied</p>
      ) : null}
    </>
  );

  const cls = cn(
    "block w-full rounded-xl border bg-surface p-4 text-left transition-colors duration-fast",
    selected ? "border-primary ring-2 ring-primary/20" : "border-border-subtle hover:border-border-strong"
  );

  if (href) {
    return (
      <Link href={href} aria-current={selected ? "true" : undefined} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cls}>
      {body}
    </button>
  );
}

export function JobCardSkeleton() {
  return (
    <div role="status" aria-label="Loading opportunity" className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surface-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-secondary" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-secondary" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-secondary" />
        </div>
      </div>
    </div>
  );
}
