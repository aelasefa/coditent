import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient as createSupabaseClient } from "@/utils/supabase/middleware";
import { AUTH_TOKEN_KEY } from "@/lib/constants";

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register" || pathname === "/admin/login" || pathname.startsWith("/invite")) return false;
  return (
    pathname.startsWith("/profile") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/recruiter") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/company") ||
    pathname.startsWith("/companies")
  );
}

function buildLoginRedirect(request: NextRequest): URL {
  const { pathname, search } = request.nextUrl;
  const nextPath = encodeURIComponent(`${pathname}${search}`);
  const loginPath = pathname.startsWith("/admin") ? "/admin/login" : "/login";
  return new URL(`${loginPath}?next=${nextPath}`, request.url);
}

function decodeJwtPayload(token: string): { role?: string; company_role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadPart = parts[1];
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: string; company_role?: string };
    return payload;
  } catch { return null; }
}

function roleLogic(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
  const role = token ? decodeJwtPayload(token)?.role : null;

  if (isProtectedPath(pathname) && !token) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  if ((pathname === "/login" || pathname === "/register" || pathname === "/admin/login") && token) {
    if (role === "PLATFORM_ADMIN" || role === "ADMIN") return NextResponse.redirect(new URL("/admin", request.url));
    if (role === "COMPANY_USER") return NextResponse.redirect(new URL("/company/invitations", request.url));
    if (role === "RECRUITER") return NextResponse.redirect(new URL("/recruiter", request.url));
    return NextResponse.redirect(new URL("/profile", request.url));
  }
  if (pathname.startsWith("/recruiter") && role === "CANDIDATE") return NextResponse.redirect(new URL("/profile", request.url));
  if ((pathname.startsWith("/profile") || pathname.startsWith("/dashboard")) && (role === "RECRUITER" || role === "COMPANY_USER" || role === "PLATFORM_ADMIN")) {
    if (role === "COMPANY_USER") return NextResponse.redirect(new URL("/company/invitations", request.url));
    if (role === "PLATFORM_ADMIN") return NextResponse.redirect(new URL("/admin", request.url));
    return NextResponse.redirect(new URL("/recruiter", request.url));
  }
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/admin") && role !== "PLATFORM_ADMIN" && role !== "ADMIN") {
    if (!token) return NextResponse.redirect(buildLoginRedirect(request));
    if (role === "COMPANY_USER") return NextResponse.redirect(new URL("/company/invitations", request.url));
    if (role === "RECRUITER") return NextResponse.redirect(new URL("/recruiter", request.url));
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname.startsWith("/company") && role !== "COMPANY_USER" && role !== "PLATFORM_ADMIN") {
    if (!token) return NextResponse.redirect(buildLoginRedirect(request));
    return NextResponse.redirect(new URL("/profile", request.url));
  }
  if ((pathname.startsWith("/profile") || pathname.startsWith("/dashboard") || pathname.startsWith("/recruiter")) && (role === "PLATFORM_ADMIN" || role === "ADMIN")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createSupabaseClient(request);

  // Refresh the Supabase session so auth cookies stay valid.
  // getUser() (not getSession()) revalidates the token with the server.
  await supabase.auth.getUser();

  const response = roleLogic(request);

  // Forward any refreshed Supabase cookies onto the final response.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
