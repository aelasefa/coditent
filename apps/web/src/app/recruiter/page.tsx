"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { OfferCard } from "@/components/offer-card";
import { ServiceTeaserCards } from "@/components/service-teaser-cards";
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
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Recruiter Offers</h1>
          <p className="mt-1 text-sm text-slate-600">Publish and manage all active job and internship offers.</p>
        </div>
        <Link className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/recruiter/offers/new">
          New Offer
        </Link>
      </header>

      {offersQuery.isLoading ? <p className="text-sm text-slate-600">Loading offers...</p> : null}
      {offersQuery.isError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Failed to load offers.
        </p>
      ) : null}

      <div className="space-y-3">
        {!offersQuery.isLoading && offers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            No offers published yet.
          </div>
        ) : null}

        {offers.map((offer) => {
          const canToggle = meQuery.data?.id === offer.recruiter_id;
          return (
            <OfferCard
              key={offer.id}
              offer={offer}
              action={
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                  disabled={!canToggle || toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate(offer.id)}
                  type="button"
                >
                  {offer.active ? "Set Inactive" : "Set Active"}
                </button>
              }
            />
          );
        })}
      </div>

      <ServiceTeaserCards />
    </main>
  );
}
