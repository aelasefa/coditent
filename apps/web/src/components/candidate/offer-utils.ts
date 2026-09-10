import type { Offer } from "@/lib/types";

export function parseSkills(requiredSkills?: string | null): string[] {
  if (!requiredSkills) return [];
  return requiredSkills
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function formatSalary(min?: number | null, max?: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => n.toLocaleString();
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max as number)}`;
}

export function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function offerLocation(o: Offer): string | null {
  return o.location || o.region || null;
}
