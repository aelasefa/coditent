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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{offer.title}</h3>
          <p className="text-sm text-slate-600">
            {offer.company} - {offer.region}
          </p>
        </div>
        {typeof score === "number" ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-800">
            Score {score}
          </span>
        ) : null}
      </div>

      <p className="mb-2 text-sm leading-relaxed text-slate-700">{offer.description}</p>
      <p className="mb-3 text-sm text-slate-700">
        <span className="font-medium">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <div className="mb-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Raisonnement IA (FR)
          </p>
          <p>{reasoning}</p>
        </div>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </MdCard>
  );
}
