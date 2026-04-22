"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { OfferCard } from "@/components/offer-card";
import { LogoutButton } from "@/components/logout-button";
import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { getMe, getOffers, toggleOffer } from "@/lib/api";
import { showcaseOffers } from "@/lib/showcase-offers";
import type { Offer } from "@/lib/types";

function isPendingApprovalError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.response?.status !== 403) {
    return false;
  }

  const detail = error.response.data?.detail;
  return typeof detail === "string" && detail.toLowerCase().includes("pending admin approval");
}

export default function RecruiterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const offersQuery = useQuery({
    queryKey: ["offers"],
    queryFn: getOffers,
  });

  const toggleMutation = useMutation({
    mutationFn: toggleOffer,
    onMutate: async (offerId) => {
      await queryClient.cancelQueries({ queryKey: ["offers"] });
      const previousOffers = queryClient.getQueryData<Offer[]>(["offers"]);

      queryClient.setQueryData<Offer[]>(["offers"], (current) =>
        (current ?? []).map((offer) =>
          offer.id === offerId ? { ...offer, active: !offer.active } : offer
        )
      );

      return { previousOffers };
    },
    onError: (_error, _offerId, context) => {
      if (context?.previousOffers) {
        queryClient.setQueryData(["offers"], context.previousOffers);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });

  useEffect(() => {
    if (isPendingApprovalError(meQuery.error) || isPendingApprovalError(offersQuery.error)) {
      router.replace("/pending-approval");
    }
  }, [meQuery.error, offersQuery.error, router]);

  const liveOffers = offersQuery.data ?? [];

  const offers = useMemo(() => {
    if (liveOffers.length >= 20) {
      return liveOffers;
    }

    const usedIds = new Set(liveOffers.map((offer) => offer.id));
    const filler = showcaseOffers
      .filter((offer) => !usedIds.has(offer.id))
      .slice(0, 20 - liveOffers.length);

    return [...liveOffers, ...filler];
  }, [liveOffers]);

  const showcaseCount = Math.max(0, offers.length - liveOffers.length);

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background pb-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-20 top-6 h-80 w-80 rounded-full bg-md-primary/18 blur-3xl" />
        <div className="md-glow absolute -right-20 top-1/3 h-96 w-96 rounded-full bg-md-tertiary/20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="md-fade-up flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
              Recruiter workspace
            </p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Offer management</h1>
            <p className="mt-2 text-sm text-md-onSurfaceVariant">
              Track active opportunities and toggle offer availability in real time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-full border border-md-outline/60 px-4 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
              href="/dashboard/recommendations"
            >
              Recommendations
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-full bg-md-primary px-4 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
              href="/recruiter/offers/new"
            >
              New offer
            </Link>
            <LogoutButton />
          </div>
        </header>

        <MdCard className="md-fade-up md-fade-delay-1 mt-6 rounded-md-xl p-5 sm:p-6">
          <p className="text-sm text-md-onSurfaceVariant">
            Signed in as <span className="font-medium text-md-foreground">{meQuery.data?.full_name ?? "Recruiter"}</span>
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">
            Showing {offers.length} offers ({liveOffers.length} live{showcaseCount > 0 ? ` + ${showcaseCount} showcase` : ""})
          </p>
        </MdCard>

        {offersQuery.isLoading ? (
          <MdCard className="mt-6 rounded-md-xl p-8 text-center text-md-onSurfaceVariant">
            Loading offers...
          </MdCard>
        ) : null}

        {offersQuery.isError && !isPendingApprovalError(offersQuery.error) ? (
          <MdCard className="mt-6 rounded-md-xl border-rose-300 bg-rose-100/60 p-6 text-sm text-rose-800">
            Unable to load offers right now. Please retry.
          </MdCard>
        ) : null}

        {!offersQuery.isLoading && !offersQuery.isError && liveOffers.length === 0 ? (
          <MdCard className="mt-6 rounded-md-xl p-8 text-center text-md-onSurfaceVariant">
            No live offers yet. You can still browse showcase offers below while you publish your first one.
          </MdCard>
        ) : null}

        <div className="mt-6 space-y-4">
          {offers.map((offer) => {
            const isShowcase = offer.id.startsWith("showcase-");
            const canToggle = !isShowcase && meQuery.data?.id === offer.recruiter_id;

            return (
              <OfferCard
                key={offer.id}
                offer={offer}
                action={
                  isShowcase ? (
                    <span className="inline-flex rounded-full bg-md-secondaryContainer px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-md-onSecondaryContainer">
                      Showcase
                    </span>
                  ) : (
                    <MdButton
                      disabled={!canToggle || toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate(offer.id)}
                      size="sm"
                      variant={offer.active ? "outlined" : "tonal"}
                    >
                      {offer.active ? "Set inactive" : "Set active"}
                    </MdButton>
                  )
                }
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
