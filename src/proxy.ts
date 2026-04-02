import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LONACI_SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";

function withRequestId(response: NextResponse): NextResponse {
  response.headers.set("X-Request-Id", globalThis.crypto.randomUUID());
  return response;
}

/**
 * Chemins API accessibles sans cookie de session (aligné avec
 * `src/config/public-api-routes.ts` — exécuter `npm run check:api-routes` en CI).
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
  if (request.method === "TRACE" || request.method === "TRACK") {
    return withRequestId(new NextResponse(null, { status: 405 }));
  }

  if (request.method === "OPTIONS") {
    return withRequestId(NextResponse.next());
  }

  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return withRequestId(NextResponse.next());
  }

  if (isPublicApiPath(pathname)) {
    return withRequestId(NextResponse.next());
  }

  const token = request.cookies.get(LONACI_SESSION_COOKIE_NAME)?.value;
  if (!token?.trim()) {
    return withRequestId(
      NextResponse.json({ message: "Non authentifié" }, { status: 401 }),
    );
  }

  return withRequestId(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
