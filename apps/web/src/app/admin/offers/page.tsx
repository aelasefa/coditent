"use client";

import { useQuery } from "@tanstack/react-query";

import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-container";
import { getAdminOffers } from "@/lib/api";

export default function AdminOffersPage() {
  const offersQuery = useQuery({
    queryKey: ["admin", "offers"],
    queryFn: getAdminOffers,
  });

  return (
    <AdminShell>
      <div className="py-2">
        <PageHeader title="All offers" description="Review every opportunity published across the platform." />

        {offersQuery.isLoading ? <Card className="p-6">Loading offers…</Card> : null}

        <div className="mt-6 space-y-4">
          {offersQuery.data?.map((offer) => (
            <Card key={offer.id} className="p-5">
              <p className="font-semibold">{offer.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{offer.company} · {offer.region}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                {offer.type} - {offer.active ? "active" : "inactive"}
              </p>
            </Card>
          ))}

          {offersQuery.data && offersQuery.data.length === 0 ? (
            <Card className="border-dashed p-8 text-center text-muted-foreground">No offers found.</Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
