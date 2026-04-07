import type { Offer } from "@/lib/types";

interface OfferCardProps {
  offer: Offer;
  score?: number;
  reasoning?: string;
  action?: React.ReactNode;
}

export function OfferCard({ offer, score, reasoning, action }: OfferCardProps) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{offer.title}</h3>
          <p className="text-sm text-slate-600">
            {offer.company} - {offer.region}
          </p>
        </div>
        {typeof score === "number" ? (
          <span className="rounded bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-800">
            Score: {score}
          </span>
        ) : null}
      </div>

      <p className="mb-2 text-sm text-slate-700">{offer.description}</p>
      <p className="mb-3 text-sm text-slate-700">
        <span className="font-medium">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <p className="mb-3 rounded bg-slate-100 p-2 text-sm text-slate-700">{reasoning}</p>
      ) : null}

      {action ? <div>{action}</div> : null}
    </article>
  );
}
