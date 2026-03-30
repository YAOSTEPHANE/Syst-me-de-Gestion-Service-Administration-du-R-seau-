import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LONACI_SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";

/**
 * Routes API accessibles sans cookie de session (aligné sur les handlers sans requireApiAuth
 * ou protégés par un autre mécanisme : token, CRON_SECRET, etc.).
 */
function isPublicApiPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/auth/reset-password")) return true;
  if (pathname === "/api/cron/daily-jobs") return true;
  if (pathname.startsWith("/api/signatures/dossier/")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(LONACI_SESSION_COOKIE_NAME)?.value;
  if (!token?.trim()) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
