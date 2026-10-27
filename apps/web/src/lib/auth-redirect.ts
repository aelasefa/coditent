import type { User } from "@/lib/types";

export function safeNextDestination(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /\\|%5c/i.test(raw)) return null;
  try {
    const base = "https://coditent.invalid";
    const destination = new URL(raw, base);
    return destination.origin === base ? `${destination.pathname}${destination.search}${destination.hash}` : null;
  } catch {
    return null;
  }
}

export function safeAdminNextDestination(raw: string | null): string | null {
  const destination = safeNextDestination(raw);
  return destination && (destination === "/admin" || destination.startsWith("/admin/"))
    ? destination
    : null;
}

export function getAuthenticatedDestination(
  user: User,
  options: { next?: string | null; isNewRegistration?: boolean } = {}
): string {
  const next = safeNextDestination(options.next ?? null);
  if (next) return next;

  if (user.role === "PLATFORM_ADMIN") return "/admin";
  if (user.role === "COMPANY_USER") return "/company";
  if (user.role === "RECRUITER") {
    if (options.isNewRegistration && !user.is_approved) return "/pending-approval";
    return "/companies";
  }
  return "/dashboard";
}
