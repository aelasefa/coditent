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
    <MdCard className="group relative overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 backdrop-blur-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_60px_-30px_rgba(0,0,0,0.7)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-lg backdrop-blur">
              {avatar}
            </span>
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[11px] backdrop-blur">
              {offer.type === "JOB" ? "💼" : "🎓"}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-white leading-tight">{offer.title}</h3>
            <p className="text-xs font-medium text-white/60 mt-0.5">
              {offer.company} · {offer.region}
            </p>
          </div>
        </div>

        {typeof score === "number" ? (
          <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900">
            {score} match
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/70">{offer.type}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/70">{offer.field}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/70">{offer.region}</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${offer.active ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-white/50"}`}
        >
          {offer.active ? "Active" : "Paused"}
        </span>
      </div>

      <p className="mb-2 text-sm leading-6 text-white/70 line-clamp-3">{offer.description}</p>
      <p className="mb-3 text-xs leading-6 text-white/50">
        <span className="font-semibold text-white/80">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <p className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-xs leading-5 text-violet-200">
          <span className="font-semibold text-violet-100">AI insight:</span> {reasoning}
        </p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </MdCard>
  );
}
