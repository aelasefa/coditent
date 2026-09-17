import type { User } from "@/lib/types";

export function safeNextDestination(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

export function getAuthenticatedDestination(
  user: User,
  options: { next?: string | null; isNewRegistration?: boolean } = {}
): string {
  const next = safeNextDestination(options.next ?? null);
  if (next) return next;

  if (user.role === "PLATFORM_ADMIN" || user.role === "ADMIN") return "/admin";
  if (user.role === "COMPANY_USER") return "/company";
  if (user.role === "RECRUITER") {
    if (options.isNewRegistration && !user.is_approved) return "/pending-approval";
    return "/recruiter";
  }
  return options.isNewRegistration ? "/profile" : "/dashboard";
}
