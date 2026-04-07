"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OfferCard } from "@/components/offer-card";
import { LogoutButton } from "@/components/logout-button";
import { getMe, getOffers, toggleOffer } from "@/lib/api";
import type { Offer } from "@/lib/types";

export default function RecruiterPage() {
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

  const offers = offersQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recruiter Offers</h1>
        <div className="flex items-center gap-2">
          <Link className="rounded bg-slate-900 px-3 py-1 text-sm text-white" href="/recruiter/offers/new">
            New Offer
          </Link>
          <LogoutButton />
        </div>
      </header>

      {offersQuery.isLoading ? <p>Loading offers...</p> : null}

      <div className="space-y-3">
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
    </main>
  );
}
