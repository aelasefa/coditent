import type { Offer } from "@/lib/types";
import { MdCard } from "@/components/ui/md-card";

interface OfferCardProps {
  offer: Offer;
  score?: number;
  reasoning?: string;
  action?: React.ReactNode;
}

const avatarSet = ["🧑‍💻", "🧠", "🎨", "📊", "🚀", "🤝", "🛠️", "🌟", "🎯", "💼"];

function avatarForOffer(offer: Offer): string {
  const seed = `${offer.company}-${offer.title}-${offer.field}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return avatarSet[hash % avatarSet.length];
}

export function OfferCard({ offer, score, reasoning, action }: OfferCardProps) {
  const avatar = avatarForOffer(offer);

  return (
    <MdCard className="group relative overflow-hidden rounded-md-lg border-md-outline/20 bg-md-surface p-5">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-md-primary/12 blur-2xl transition-opacity duration-300 ease-md group-hover:opacity-90" />

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-md-outline/20 bg-md-background text-xl shadow-md-sm">
              {avatar}
            </span>
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-md-outline/20 bg-md-secondaryContainer text-[11px]">
              {offer.type === "JOB" ? "💼" : "🎓"}
            </span>
          </div>

          <div className="min-w-0">
          <h3 className="text-lg font-medium tracking-tight">{offer.title}</h3>
            <p className="text-sm text-md-onSurfaceVariant">
            {offer.company} - {offer.region}
          </p>
          </div>
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
        <span
          className={`rounded-full px-3 py-1 ${offer.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
        >
          {offer.active ? "Active" : "Paused"}
        </span>
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
