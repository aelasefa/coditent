import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_TOKEN_KEY } from "@/lib/constants";

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/profile") || pathname.startsWith("/dashboard") || pathname.startsWith("/recruiter");
}

function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    const payloadPart = parts[1];
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return payload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
  const role = token ? decodeJwtPayload(token)?.role : null;

  if (isProtectedPath(pathname) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/login" || pathname === "/register") && token) {
    if (role === "RECRUITER" || role === "ADMIN") {
      return NextResponse.redirect(new URL("/recruiter", request.url));
    }

    return NextResponse.redirect(new URL("/profile", request.url));
  }

  if (pathname.startsWith("/recruiter") && role === "CANDIDATE") {
    return NextResponse.redirect(new URL("/profile", request.url));
  }

  if ((pathname.startsWith("/profile") || pathname.startsWith("/dashboard")) && role === "RECRUITER") {
    return NextResponse.redirect(new URL("/recruiter", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile/:path*", "/dashboard/:path*", "/recruiter/:path*", "/login", "/register"],
};
