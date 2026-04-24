"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { MdCard } from "@/components/ui/md-card";
import { getAdminOffers } from "@/lib/api";

export default function AdminOffersPage() {
  const offersQuery = useQuery({
    queryKey: ["admin", "offers"],
    queryFn: getAdminOffers,
  });

  return (
    <main className="min-h-screen bg-md-background pb-14">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Admin workspace</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight">All offers</h1>
          </div>
          <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin">
            Back to dashboard
          </Link>
        </header>

        {offersQuery.isLoading ? <MdCard className="mt-6 p-6">Loading offers...</MdCard> : null}

        <div className="mt-6 space-y-4">
          {offersQuery.data?.map((offer) => (
            <MdCard key={offer.id} className="p-5">
              <p className="font-medium">{offer.title}</p>
              <p className="mt-1 text-sm text-md-onSurfaceVariant">{offer.company} - {offer.region}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">
                {offer.type} - {offer.active ? "active" : "inactive"}
              </p>
            </MdCard>
          ))}

          {offersQuery.data && offersQuery.data.length === 0 ? (
            <MdCard className="p-6 text-md-onSurfaceVariant">No offers found.</MdCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}
