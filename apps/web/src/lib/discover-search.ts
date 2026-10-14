import type { Recommendation } from "@/lib/types";

export interface DiscoverFilters {
  query: string;
  field: string;
  region: string;
  type: "ALL" | "JOB" | "INTERNSHIP";
  sort: "match" | "newest";
}

export function filterAndSortRecommendations(
  recommendations: Recommendation[],
  filters: DiscoverFilters
): Recommendation[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const field = filters.field.trim().toLocaleLowerCase();
  const region = filters.region.trim().toLocaleLowerCase();

  const matches = recommendations.filter((recommendation) => {
    const offer = recommendation.offer;
    if (field && !offer.field.toLocaleLowerCase().includes(field)) return false;
    if (region && !offer.region.toLocaleLowerCase().includes(region)) return false;
    if (filters.type !== "ALL" && offer.type !== filters.type) return false;
    if (!query) return true;
    const searchable = [
      offer.title,
      offer.company,
      offer.required_skills ?? "",
      offer.field,
      offer.region,
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });

  return [...matches].sort((left, right) => {
    if (filters.sort === "newest") {
      return String(right.offer.posted_at).localeCompare(String(left.offer.posted_at));
    }
    return (right.score ?? right.ai_score ?? 0) - (left.score ?? left.ai_score ?? 0);
  });
}

export function paginateRecommendations(
  recommendations: Recommendation[],
  page: number,
  pageSize: number
): Recommendation[] {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const start = (safePage - 1) * safePageSize;
  return recommendations.slice(start, start + safePageSize);
}
