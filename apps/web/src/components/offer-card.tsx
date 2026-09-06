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
    <MdCard className="group relative overflow-hidden rounded-xl border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-[#121215]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-lg dark:border-zinc-700 dark:bg-zinc-900">
              {avatar}
            </span>
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
              {offer.type === "JOB" ? "💼" : "🎓"}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">{offer.title}</h3>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
              {offer.company} · {offer.region}
            </p>
          </div>
        </div>

        {typeof score === "number" ? (
          <span className="inline-flex rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            {score} match
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{offer.type}</span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{offer.field}</span>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{offer.region}</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${offer.active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"}`}
        >
          {offer.active ? "Active" : "Paused"}
        </span>
      </div>

      <p className="mb-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300 line-clamp-3">{offer.description}</p>
      <p className="mb-3 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <span className="font-semibold">AI insight:</span> {reasoning}
        </p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </MdCard>
  );
}
