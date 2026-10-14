import type { Offer } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { offerLogoSrc } from "@/lib/api";

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
  const logoSrc = offerLogoSrc(offer);

  return (
    <Card className="group relative overflow-hidden rounded-2xl p-5 shadow-sm transition-colors hover:border-border-strong">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="h-11 w-11 rounded-xl border border-border-subtle object-cover" />
            ) : (
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-lg">
                {avatar}
              </span>
            )}
            <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[11px]">
              {offer.type === "JOB" ? "💼" : "🎓"}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">{offer.title}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              {offer.company} · {offer.region}
            </p>
          </div>
        </div>

        {typeof score === "number" ? (
          <span className="inline-flex rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {score} match
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">{offer.type}</span>
        <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">{offer.field}</span>
        <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">{offer.region}</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${offer.active ? "border-success/30 bg-success-background text-success" : "border-border bg-surface-secondary text-muted-foreground"}`}
        >
          {offer.active ? "Active" : "Paused"}
        </span>
      </div>

      <p className="mb-2 line-clamp-3 text-sm leading-6 text-foreground-secondary">{offer.description}</p>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        <span className="font-semibold text-foreground-secondary">Requirements:</span> {offer.requirements}
      </p>

      {reasoning ? (
        <p className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-foreground-secondary">
          <span className="font-semibold text-primary">AI insight:</span> {reasoning}
        </p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </Card>
  );
}
