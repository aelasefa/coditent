import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_TOKEN_KEY } from "@/lib/constants";

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/profile") || pathname.startsWith("/dashboard") || pathname.startsWith("/recruiter");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;

  if (isProtectedPath(pathname) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/login" || pathname === "/register") && token) {
    return NextResponse.redirect(new URL("/profile", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile/:path*", "/dashboard/:path*", "/recruiter/:path*", "/login", "/register"],
};
