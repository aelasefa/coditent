import type { Metadata } from "next";
import { getApiBaseUrl } from "@/lib/api";
import { categories, type CategorySlug } from "@/lib/categories";
import { isCategorySlug, offersForCategory } from "@/lib/offer-category";
import type { Offer } from "@/lib/types";
import OffersClient from "./offers-client";

export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

function resolveCategory(value: string): CategorySlug {
  return isCategorySlug(value) ? value : "all";
}

async function loadPublicOffers(): Promise<Offer[]> {
  const response = await fetch(`${getApiBaseUrl()}/offers?limit=100&offset=0`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`Offers request failed with ${response.status}`);
  const payload = (await response.json()) as { offers?: Offer[] };
  return Array.isArray(payload.offers) ? payload.offers : [];
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const categorySlug = resolveCategory((await params).category);
  const category = categories.find((item) => item.slug === categorySlug) ?? categories[categories.length - 1];
  return {
    title: `${category.label} Opportunities | Coditent`,
    description: `Explore open ${category.label.toLowerCase()} roles from companies hiring on Coditent.`,
  };
}

export default async function CategoryOffersPage({ params }: CategoryPageProps) {
  const categorySlug = resolveCategory((await params).category);
  let offers: Offer[] = [];
  let loadError = false;
  try {
    offers = offersForCategory(await loadPublicOffers(), categorySlug);
  } catch {
    loadError = true;
  }
  return <OffersClient categorySlug={categorySlug} initialOffers={offers} initialLoadError={loadError} />;
}
