import type { Offer } from "@/lib/types";
import { MdCard } from "@/components/ui/md-card";

interface OfferCardProps {
  offer: Offer;
  score?: number;
  reasoning?: string;
  action?: React.ReactNode;
}

export function OfferCard({ offer, score, reasoning, action }: OfferCardProps) {
  return (
    <MdCard className="rounded-md-lg border-md-outline/20 bg-md-surface p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium tracking-tight">{offer.title}</h3>
          <p className="text-sm text-md-onSurfaceVariant">
            {offer.company} - {offer.region}
          </p>
        </div>
        {typeof score === "number" ? (
          <span className="inline-flex rounded-full bg-md-secondaryContainer px-3 py-1 text-xs font-medium text-md-onSecondaryContainer">
            Score: {score}
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.08em] text-md-onSurfaceVariant">
        <span className="rounded-full bg-md-background px-3 py-1">{offer.type}</span>
        <span className="rounded-full bg-md-background px-3 py-1">{offer.field}</span>
        <span className="rounded-full bg-md-background px-3 py-1">{offer.region}</span>
      </div>

      <p className="mb-2 text-sm leading-7 text-md-onSurfaceVariant">{offer.description}</p>
      <p className="mb-3 text-sm leading-7 text-md-onSurfaceVariant">
        <span className="font-medium text-md-foreground">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <p className="mb-4 rounded-md border border-md-outline/20 bg-md-background px-3 py-2 text-sm text-md-onSurfaceVariant">
          {reasoning}
        </p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </MdCard>
  );
}
