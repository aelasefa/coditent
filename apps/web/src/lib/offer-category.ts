import { categories, type CategorySlug } from "./categories.ts";
import type { Offer } from "./types";

export function isCategorySlug(value: string): value is CategorySlug {
  return categories.some((category) => category.slug === value);
}

export function inferOfferCategory(offer: Offer): CategorySlug {
  const searchable = `${offer.title} ${offer.company} ${offer.field} ${offer.description} ${offer.requirements}`.toLowerCase();
  if (searchable.includes("design")) return "design";
  if (searchable.includes("data") || searchable.includes("analytics") || searchable.includes("bi")) return "data";
  if (searchable.includes("customer success") || searchable.includes("onboarding")) return "success";
  if (
    searchable.includes("recruit") ||
    searchable.includes("operation") ||
    searchable.includes("hr") ||
    searchable.includes("support")
  ) {
    return "operations";
  }
  return "engineering";
}

export function offersForCategory(offers: Offer[], category: CategorySlug): Offer[] {
  if (category === "all") return offers;
  return offers.filter((offer) => inferOfferCategory(offer) === category);
}
