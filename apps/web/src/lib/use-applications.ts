"use client";

import { useQuery } from "@tanstack/react-query";

import { getMyApplications } from "@/lib/api";
import type { Application } from "@/lib/types";

export function useMyApplications(enabled = true) {
  return useQuery({
    queryKey: ["my-applications"],
    queryFn: getMyApplications,
    enabled,
    staleTime: 30_000,
  });
}

export function useIsOfferApplied(offerId: string | undefined, enabled = true) {
  const query = useMyApplications(enabled && Boolean(offerId));

  if (!offerId) {
    return { applied: false, application: null as Application | null, ...query };
  }

  const application = query.data?.find((item) => item.offer_id === offerId) ?? null;
  return {
    applied: Boolean(application),
    application,
    ...query,
  };
}
